import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  DocumentData,
  writeBatch
} from 'firebase/firestore';
import { Exam, Room, Submission, StudentInfo, User, Role, Question, Class, ClassJoinRequest } from '../types';
import { calculateScore, getTotalCorrectCount, getTotalWrongCount } from './scoringService';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA5ruuUNX9VKbw4lfePAQyyaqVEX8D8LVE",
  authDomain: "taodeword1703.firebaseapp.com",
  projectId: "taodeword1703",
  storageBucket: "taodeword1703.firebasestorage.app",
  messagingSenderId: "900520344405",
  appId: "1:900520344405:web:621f4b285549fec4694ddc",
  measurementId: "G-QYFKN97DEE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ============ HELPER FUNCTIONS ============
const toDate = (timestamp: Timestamp | Date | undefined | null): Date | undefined => {
  if (!timestamp) return undefined;
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  return undefined;
};

// ✅ Sanitize data cho Firestore - JSON.parse/stringify triệt để nhất
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined || obj === null) return null;
  try {
    return JSON.parse(JSON.stringify(obj, (_key, value) => {
      if (value === undefined) return null;
      if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return 0;
      if (typeof value === 'function') return undefined;
      return value;
    }));
  } catch {
    return null;
  }
};

// ✅ Xóa TRIỆT ĐỂ mọi base64 còn sót trong document chính
const removeAllBase64 = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Xóa inline data URI trong text (VD: <img src="data:image/png;base64,...">)
    if (obj.includes('base64,') && obj.length > 2000) {
      return obj.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
    }
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.map(item => removeAllBase64(item));
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Xóa hoàn toàn field "base64" - đã lưu ở subcollection rồi
      if (key === 'base64') continue;
      cleaned[key] = removeAllBase64(value);
    }
    return cleaned;
  }
  return obj;
  
};

// ✅ MỚI: Tách hình ảnh base64 ra khỏi exam data (tránh vượt 1MB Firestore limit)
const extractImagesFromExam = (examData: any): {
  strippedData: any;
  imageDocuments: { questionNumber: number; imageIndex: number; id: string; filename: string; base64: string; contentType: string }[];
} => {
  const imageDocuments: any[] = [];

  // Tách base64 từ questions[].images[]
  const strippedQuestions = (examData.questions || []).map((q: any) => {
    if (!q.images || q.images.length === 0) return q;

    const strippedImages = q.images.map((img: any, idx: number) => {
      if (img.base64 && img.base64.length > 0) {
        // Lưu vào danh sách để ghi subcollection
        imageDocuments.push({
          questionNumber: q.number,
          imageIndex: idx,
          id: img.id || `img_${idx}`,
          filename: img.filename || `image${idx}.png`,
          base64: img.base64,
          contentType: img.contentType || 'image/png'
        });

        // Giữ lại metadata, XÓA base64
        return {
          id: img.id || `img_${idx}`,
          filename: img.filename || `image${idx}.png`,
          contentType: img.contentType || 'image/png'
          // ❌ KHÔNG có base64
        };
      }
      return img;
    });

    return { ...q, images: strippedImages };
  });

  // Tách base64 từ exam-level images[]
  const strippedExamImages = (examData.images || []).map((img: any, idx: number) => {
    if (img.base64 && img.base64.length > 0) {
      imageDocuments.push({
        questionNumber: 0, // exam-level
        imageIndex: idx,
        id: img.id || `exam_img_${idx}`,
        filename: img.filename || `exam_image${idx}.png`,
        base64: img.base64,
        contentType: img.contentType || 'image/png'
      });

      return {
        id: img.id || `exam_img_${idx}`,
        filename: img.filename || `exam_image${idx}.png`,
        contentType: img.contentType || 'image/png'
      };
    }
    return img;
  });

  return {
    strippedData: {
      ...examData,
      questions: strippedQuestions,
      images: strippedExamImages
    },
    imageDocuments
  };
};

// ✅ MỚI: Load hình ảnh từ subcollection và gắn lại vào questions
const mergeImagesIntoExam = (examData: any, imageDocs: any[]): any => {
  if (!imageDocs || imageDocs.length === 0) return examData;

  // ✅ Ghép chunks lại thành base64 hoàn chỉnh
  const imageMap = new Map<string, any[]>();
  for (const doc of imageDocs) {
    const key = `${doc.questionNumber}_${doc.imageIndex}_${doc.id}`;
    if (!imageMap.has(key)) imageMap.set(key, []);
    imageMap.get(key)!.push(doc);
  }

  const assembledImages: any[] = [];
  for (const [, chunks] of imageMap) {
    chunks.sort((a: any, b: any) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
    const fullBase64 = chunks.map((c: any) => c.base64 || '').join('');
    assembledImages.push({
      questionNumber: chunks[0].questionNumber,
      imageIndex: chunks[0].imageIndex,
      id: chunks[0].id,
      filename: chunks[0].filename,
      base64: fullBase64,
      contentType: chunks[0].contentType || 'image/png'
    });
  }

  const questions = (examData.questions || []).map((q: any) => {
    const qImages = assembledImages
      .filter((img: any) => img.questionNumber === q.number)
      .sort((a: any, b: any) => (a.imageIndex || 0) - (b.imageIndex || 0));

    if (qImages.length > 0) {
      return {
        ...q,
        images: qImages.map((img: any) => ({
          id: img.id,
          filename: img.filename,
          base64: img.base64,
          contentType: img.contentType
        }))
      };
    }
    return q;
  });

  const examImages = assembledImages
    .filter((img: any) => img.questionNumber === 0)
    .sort((a: any, b: any) => (a.imageIndex || 0) - (b.imageIndex || 0))
    .map((img: any) => ({
      id: img.id,
      filename: img.filename,
      base64: img.base64,
      contentType: img.contentType
    }));

  return {
    ...examData,
    questions,
    images: examImages.length > 0 ? examImages : examData.images
  };
};

// ============ AUTH FUNCTIONS ============

export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;

    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      const hasUsers = await hasAnyUsers();
      const isFirstUser = !hasUsers;

      const newUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Unknown',
        email: firebaseUser.email || undefined,
        avatar: firebaseUser.photoURL || undefined,
        role: isFirstUser ? Role.ADMIN : Role.TEACHER,
        isApproved: isFirstUser,
        createdAt: new Date(),
        classIds: []
      };

      await setDoc(userRef, {
        ...newUser,
        createdAt: serverTimestamp()
      });

      return newUser;
    }

    const userData = userSnap.data();
    return {
      id: userSnap.id,
      name: userData.name || '',
      email: userData.email,
      avatar: userData.avatar,
      role: userData.role || Role.TEACHER,
      isApproved: userData.isApproved ?? false,
      createdAt: toDate(userData.createdAt),
      classIds: userData.classIds || []
    };
  } catch (error) {
    console.error('Google sign in error:', error);
    throw error;
  }
};

// ✅ STUDENT LOGIN với Google
export const signInStudentWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;

    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      const newStudent: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Unknown',
        email: firebaseUser.email || undefined,
        avatar: firebaseUser.photoURL || undefined,
        role: Role.STUDENT,
        isApproved: false,
        createdAt: new Date(),
        classIds: []
      };

      await setDoc(userRef, {
        ...newStudent,
        createdAt: serverTimestamp()
      });

      return newStudent;
    }

    const userData = userSnap.data();

    const approved = userData.isApproved ?? false;

    if (!approved && userData.role !== Role.STUDENT) {
      await setDoc(userRef, { role: Role.STUDENT }, { merge: true });
    }

    return {
      id: userSnap.id,
      name: userData.name || '',
      email: userData.email,
      avatar: userData.avatar,
      role: Role.STUDENT,
      isApproved: userData.isApproved ?? false,
      createdAt: toDate(userData.createdAt),
      classIds: userData.classIds || []
    };
  } catch (error) {
    console.error('Student Google sign in error:', error);
    throw error;
  }
};

export const signOutUser = () => signOut(auth);

let anonymousSignInPromise: Promise<void> | null = null;

export const ensureSignedIn = async (): Promise<void> => {
  if (auth.currentUser) return;

  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then(() => {})
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }

  await anonymousSignInPromise;
};

export const hasAnyUsers = async (): Promise<boolean> => {
  const snapshot = await getDocs(collection(db, 'users'));
  return !snapshot.empty;
};

export const isUserAdmin = async (userId: string): Promise<boolean> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const role = userSnap.data().role;
    return role === Role.ADMIN || role === Role.LEADER;
  }
  return false;
};

export const getCurrentUser = async (): Promise<User | null> => {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;

  const userRef = doc(db, 'users', firebaseUser.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const userData = userSnap.data();
    return {
      id: userSnap.id,
      name: userData.name || '',
      email: userData.email,
      avatar: userData.avatar,
      role: userData.role || Role.TEACHER,
      isApproved: userData.isApproved ?? false,
      createdAt: toDate(userData.createdAt),
      classIds: userData.classIds || []
    };
  }
  return null;
};

// ============ CLASS MANAGEMENT ============

export const createClass = async (classData: {
  name: string;
  grade?: string;
  subject?: string;
  teacherId: string;
  teacherName: string;
}): Promise<string> => {
  const newClass: Omit<Class, 'id'> = {
    name: classData.name,
    grade: classData.grade,
    subject: classData.subject,
    teacherId: classData.teacherId,
    teacherName: classData.teacherName,
    studentIds: [],
    totalStudents: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const classRef = await addDoc(collection(db, 'classes'), {
    ...newClass,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return classRef.id;
};

export const getAllClasses = async (): Promise<Class[]> => {
  const snapshot = await getDocs(collection(db, 'classes'));
  const classes = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || '',
      grade: data.grade,
      subject: data.subject,
      teacherId: data.teacherId || '',
      teacherName: data.teacherName || '',
      studentIds: data.studentIds || [],
      totalStudents: data.totalStudents || 0,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    };
  });

  classes.sort((a, b) => {
    const dateA = a.createdAt?.getTime() || 0;
    const dateB = b.createdAt?.getTime() || 0;
    return dateB - dateA;
  });

  return classes;
};

export const getClassesByTeacher = async (teacherId: string): Promise<Class[]> => {
  const q = query(collection(db, 'classes'), where('teacherId', '==', teacherId));

  const snapshot = await getDocs(q);
  const classes = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || '',
      grade: data.grade,
      subject: data.subject,
      teacherId: data.teacherId || '',
      teacherName: data.teacherName || '',
      studentIds: data.studentIds || [],
      totalStudents: data.totalStudents || 0,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    };
  });

  classes.sort((a, b) => {
    const dateA = a.createdAt?.getTime() || 0;
    const dateB = b.createdAt?.getTime() || 0;
    return dateB - dateA;
  });

  return classes;
};

export const getClass = async (classId: string): Promise<Class | null> => {
  const classRef = doc(db, 'classes', classId);
  const classSnap = await getDoc(classRef);

  if (classSnap.exists()) {
    const data = classSnap.data();
    return {
      id: classSnap.id,
      name: data.name || '',
      grade: data.grade,
      subject: data.subject,
      teacherId: data.teacherId || '',
      teacherName: data.teacherName || '',
      studentIds: data.studentIds || [],
      totalStudents: data.totalStudents || 0,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    };
  }
  return null;
};

export const addStudentToClass = async (classId: string, studentId: string): Promise<void> => {
  const classRef = doc(db, 'classes', classId);
  const classSnap = await getDoc(classRef);

  if (!classSnap.exists()) {
    throw new Error('Class not found');
  }

  const classData = classSnap.data();
  const studentIds = classData.studentIds || [];

  if (!studentIds.includes(studentId)) {
    studentIds.push(studentId);

    await updateDoc(classRef, {
      studentIds,
      totalStudents: studentIds.length,
      updatedAt: serverTimestamp()
    });

    const userRef = doc(db, 'users', studentId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const userClassIds = userData.classIds || [];

      if (!userClassIds.includes(classId)) {
        userClassIds.push(classId);
        await updateDoc(userRef, { classIds: userClassIds });
      }
    }
  }
};

export const removeStudentFromClass = async (classId: string, studentId: string): Promise<void> => {
  const classRef = doc(db, 'classes', classId);
  const classSnap = await getDoc(classRef);

  if (!classSnap.exists()) return;

  const classData = classSnap.data();
  const studentIds = (classData.studentIds || []).filter((id: string) => id !== studentId);

  await updateDoc(classRef, {
    studentIds,
    totalStudents: studentIds.length,
    updatedAt: serverTimestamp()
  });

  const userRef = doc(db, 'users', studentId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const userData = userSnap.data();
    const userClassIds = (userData.classIds || []).filter((id: string) => id !== classId);
    await updateDoc(userRef, { classIds: userClassIds });
  }
};

export const deleteClass = async (classId: string): Promise<void> => {
  const classData = await getClass(classId);
  if (classData) {
    for (const studentId of classData.studentIds) {
      await removeStudentFromClass(classId, studentId);
    }
  }

  const requestsQuery = query(collection(db, 'classJoinRequests'), where('classId', '==', classId));
  const requestsSnap = await getDocs(requestsQuery);
  const deletePromises = requestsSnap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  await deleteDoc(doc(db, 'classes', classId));
};

export const getStudentsInClass = async (classId: string): Promise<User[]> => {
  const classData = await getClass(classId);
  if (!classData || classData.studentIds.length === 0) return [];

  const students: User[] = [];

  for (const studentId of classData.studentIds) {
    const userRef = doc(db, 'users', studentId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      students.push({
        id: userSnap.id,
        name: data.name || '',
        email: data.email,
        avatar: data.avatar,
        role: data.role || Role.STUDENT,
        isApproved: data.isApproved ?? true,
        createdAt: toDate(data.createdAt),
        classIds: data.classIds || []
      });
    }
  }

  return students;
};

// ============ EXPORTS ============
export {
  onAuthStateChanged,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
};

// ============ SUBMISSION FUNCTIONS ============

export const createSubmission = async (submission: Omit<Submission, 'id'>): Promise<string> => {
  const submissionRef = await addDoc(collection(db, 'submissions'), {
    ...submission,
    startedAt: serverTimestamp()
  });

  try {
    const roomRef = doc(db, 'rooms', submission.roomId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const room = roomSnap.data();
      await updateDoc(roomRef, {
        totalStudents: (room.totalStudents || 0) + 1,
        updatedAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn(
      'createSubmission: không update được rooms.totalStudents (có thể do rules). Bỏ qua.',
      e
    );
  }

  return submissionRef.id;
};

export const submitExam = async (
  submissionId: string,
  answers: { [key: number]: string },
  exam: Exam,
  antiCheatData?: {
    tabSwitchCount: number;
    tabSwitchWarnings: Date[];
    autoSubmitted: boolean;
  }
): Promise<Submission> => {
  const submissionRef = doc(db, 'submissions', submissionId);
  const submissionSnap = await getDoc(submissionRef);

  if (!submissionSnap.exists()) {
    throw new Error('Submission not found');
  }

  const submissionData = submissionSnap.data();

  const scoreBreakdown = calculateScore(answers, exam);
  const totalScore = scoreBreakdown.totalScore;
  const percentage = scoreBreakdown.percentage;

  const correctCount = getTotalCorrectCount(scoreBreakdown);
  const totalQuestions = exam.questions.length;
  const wrongCount = getTotalWrongCount(scoreBreakdown, totalQuestions);

  let startedAt: Date;
  if (submissionData.startedAt instanceof Timestamp) {
    startedAt = submissionData.startedAt.toDate();
  } else if (submissionData.startedAt) {
    startedAt = new Date(submissionData.startedAt);
  } else {
    startedAt = new Date();
  }

  const submittedAt = new Date();
  const duration = Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000);

  const updatedData = {
    answers,
    scoreBreakdown,
    totalScore,
    percentage,
    score: totalScore,
    correctCount,
    wrongCount,
    totalQuestions,
    submittedAt: serverTimestamp(),
    duration,
    status: 'submitted' as const,
    tabSwitchCount: antiCheatData?.tabSwitchCount || 0,
    tabSwitchWarnings: antiCheatData?.tabSwitchWarnings || [],
    autoSubmitted: antiCheatData?.autoSubmitted || false
  };

  await updateDoc(submissionRef, updatedData);

  try {
    const roomRef = doc(db, 'rooms', submissionData.roomId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const room = roomSnap.data();
      await updateDoc(roomRef, {
        submittedCount: (room.submittedCount || 0) + 1,
        updatedAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn(
      'submitExam: không update được rooms.submittedCount (có thể do rules). Bỏ qua.',
      e
    );
  }

  return {
    id: submissionId,
    roomId: submissionData.roomId,
    roomCode: submissionData.roomCode,
    examId: submissionData.examId,
    student: submissionData.student,
    answers,
    scoreBreakdown,
    totalScore,
    percentage,
    score: totalScore,
    correctCount,
    wrongCount,
    totalQuestions,
    tabSwitchCount: updatedData.tabSwitchCount,
    tabSwitchWarnings: updatedData.tabSwitchWarnings,
    autoSubmitted: updatedData.autoSubmitted,
    startedAt,
    submittedAt,
    duration,
    status: 'submitted'
  };
};

const parseSubmissionData = (id: string, data: DocumentData): Submission => {
  return {
    id,
    roomId: data.roomId || '',
    roomCode: data.roomCode || '',
    examId: data.examId || '',
    student: data.student || { id: '', name: '' },
    answers: data.answers || {},

    scoreBreakdown: data.scoreBreakdown || {
      multipleChoice: { total: 0, correct: 0, points: 0 },
      trueFalse: { total: 0, correct: 0, partial: 0, points: 0, details: {} },
      shortAnswer: { total: 0, correct: 0, points: 0 },
      totalScore: 0,
      percentage: 0
    },
    totalScore: data.totalScore || data.score || 0,
    percentage: data.percentage || 0,

    score: data.totalScore || data.score || 0,
    correctCount: data.correctCount || 0,
    wrongCount: data.wrongCount || 0,
    totalQuestions: data.totalQuestions || 0,

    tabSwitchCount: data.tabSwitchCount || 0,
    tabSwitchWarnings: (data.tabSwitchWarnings || []).map((t: any) =>
      t instanceof Timestamp ? t.toDate() : new Date(t)
    ),
    autoSubmitted: data.autoSubmitted || false,

    startedAt: toDate(data.startedAt),
    submittedAt: toDate(data.submittedAt),
    duration: data.duration || 0,
    status: data.status || 'in_progress'
  };
};

export const getSubmission = async (submissionId: string): Promise<Submission | null> => {
  const submissionRef = doc(db, 'submissions', submissionId);
  const submissionSnap = await getDoc(submissionRef);

  if (submissionSnap.exists()) {
    return parseSubmissionData(submissionSnap.id, submissionSnap.data());
  }
  return null;
};

export const getSubmissionsByRoom = async (roomId: string): Promise<Submission[]> => {
  const q = query(collection(db, 'submissions'), where('roomId', '==', roomId));

  const snapshot = await getDocs(q);
  const submissions = snapshot.docs.map((docSnap) => parseSubmissionData(docSnap.id, docSnap.data()));

  return submissions.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
};

export const getStudentSubmission = async (roomId: string, studentId: string): Promise<Submission | null> => {
  const q = query(
    collection(db, 'submissions'),
    where('roomId', '==', roomId),
    where('student.id', '==', studentId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return parseSubmissionData(docSnap.id, docSnap.data());
};

// ✅ MỚI: Lấy tất cả bài làm của một học sinh (dùng cho lịch sử bài làm)
export const getSubmissionsByStudent = async (studentId: string): Promise<Submission[]> => {
  const q = query(
    collection(db, 'submissions'),
    where('student.id', '==', studentId)
  );

  const snapshot = await getDocs(q);
  const submissions = snapshot.docs.map((docSnap) => parseSubmissionData(docSnap.id, docSnap.data()));

  // Chỉ lấy bài đã nộp, sắp xếp theo thời gian nộp mới nhất
  return submissions
    .filter(s => s.status === 'submitted')
    .sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0));
};

// ✅ MỚI: Lấy danh sách phòng thi đang mở dành cho lớp của học sinh
export const getRoomsForStudent = async (classIds: string[]): Promise<Room[]> => {
  if (!classIds || classIds.length === 0) return [];

  const roomsMap = new Map<string, Room>();

  // Truy vấn theo từng classId
  for (const classId of classIds) {
    try {
      const q = query(
        collection(db, 'rooms'),
        where('classId', '==', classId),
        where('status', 'in', ['active', 'waiting'])
      );
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(docSnap => {
        const room = parseRoomData(docSnap.id, docSnap.data());
        roomsMap.set(room.id, room);
      });
    } catch (err) {
      console.warn(`getRoomsForStudent: lỗi khi truy vấn classId=${classId}`, err);
    }
  }

  const rooms = Array.from(roomsMap.values());

  // Lọc theo thời gian nếu có opensAt/closesAt
  const now = Date.now();
  const filtered = rooms.filter(room => {
    if (room.closesAt && now >= new Date(room.closesAt).getTime()) return false;
    return true;
  });

  return filtered.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
};

export const subscribeToSubmissions = (roomId: string, callback: (submissions: Submission[]) => void) => {
  const q = query(collection(db, 'submissions'), where('roomId', '==', roomId));

  return onSnapshot(q, (snapshot) => {
    const submissions = snapshot.docs.map((docSnap) => parseSubmissionData(docSnap.id, docSnap.data()));

    submissions.sort((a, b) => {
      if ((b.totalScore || 0) !== (a.totalScore || 0)) {
        return (b.totalScore || 0) - (a.totalScore || 0);
      }
      return (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0);
    });

    callback(submissions);
  });
};

// ============ EXAM FUNCTIONS ============

// ✅✅✅ SỬA: Tách hình ảnh ra subcollection để tránh vượt 1MB ✅✅✅
export const createExam = async (examData: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  // Bước 1: Tách base64 images ra subcollection
  const { strippedData, imageDocuments } = extractImagesFromExam(examData);

  // Bước 2: Sanitize
  let sanitized = sanitizeForFirestore(strippedData);

  // ✅ Bước 2.5: Nếu vẫn > 900KB → xóa triệt để mọi base64 còn sót
  let size = JSON.stringify(sanitized).length;
  if (size > 900000) {
    console.warn(`⚠️ Data vẫn lớn (${size} bytes), stripping ALL remaining base64...`);
    sanitized = removeAllBase64(sanitized);
    size = JSON.stringify(sanitized).length;
    console.log(`📦 After aggressive strip: ~${size} bytes`);
  }

  console.log(`📦 Exam size (final): ~${size} bytes`);
  console.log(`🖼️ Images to save separately: ${imageDocuments.length}`);

  // Bước 3: Lưu document chính
  const examRef = await addDoc(collection(db, 'exams'), {
    ...sanitized,
    hasImageSubcollection: imageDocuments.length > 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Bước 4: Lưu images vào subcollection
  // Bước 4: Lưu từng hình ảnh vào subcollection exams/{examId}/images
  // Bước 4: Lưu từng hình ảnh vào subcollection exams/{examId}/images
  // ✅ Chia nhỏ base64 > 800KB thành nhiều chunk documents
  if (imageDocuments.length > 0) {
    console.log(`🖼️ Saving ${imageDocuments.length} images to subcollection...`);
    const CHUNK_SIZE = 800000; // 800KB per chunk (safe under 1MB field limit)

    for (const imgDoc of imageDocuments) {
      const base64 = imgDoc.base64 || '';
      
      if (base64.length > CHUNK_SIZE) {
        // Ảnh lớn → chia thành nhiều chunks
        const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
        console.log(`🖼️ Image ${imgDoc.id} (q${imgDoc.questionNumber}): ${base64.length} chars → ${totalChunks} chunks`);

        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const chunkDoc = sanitizeForFirestore({
            questionNumber: imgDoc.questionNumber,
            imageIndex: imgDoc.imageIndex,
            id: imgDoc.id,
            filename: imgDoc.filename,
            contentType: imgDoc.contentType,
            base64: chunk,
            chunkIndex: i,
            totalChunks: totalChunks
          });
          if (chunkDoc) {
            await addDoc(collection(db, 'exams', examRef.id, 'images'), chunkDoc);
          }
        }
      } else {
        // Ảnh nhỏ → lưu bình thường
        const imgData = sanitizeForFirestore({
          ...imgDoc,
          chunkIndex: 0,
          totalChunks: 1
        });
        if (imgData) {
          await addDoc(collection(db, 'exams', examRef.id, 'images'), imgData);
        }
      }
    }

    console.log(`✅ All images saved to exams/${examRef.id}/images`);
  }

  return examRef.id;
};

// ✅✅✅ SỬA: Load hình ảnh từ subcollection và gắn lại ✅✅✅
export const getExam = async (examId: string): Promise<Exam | null> => {
  const examRef = doc(db, 'exams', examId);
  const examSnap = await getDoc(examRef);

  if (examSnap.exists()) {
    let data = examSnap.data();

    // ✅ Nếu có subcollection images → load và merge lại
    if (data.hasImageSubcollection) {
      try {
        const imagesSnap = await getDocs(collection(db, 'exams', examId, 'images'));
        const imageDocs = imagesSnap.docs.map((d) => d.data());

        if (imageDocs.length > 0) {
          data = mergeImagesIntoExam(data, imageDocs);
          console.log(`🖼️ Loaded ${imageDocs.length} images from subcollection for exam ${examId}`);
        }
      } catch (err) {
        console.warn('Failed to load images subcollection:', err);
      }
    }

    return {
      id: examSnap.id,
      title: data.title || '',
      description: data.description,
      timeLimit: data.timeLimit || 45,
      questions: data.questions || [],
      sections: data.sections || [],
      answers: data.answers || {},
      images: data.images,
      createdBy: data.createdBy || '',
      pointsConfig: data.pointsConfig,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    };
  }
  return null;
};

export const getExamsByTeacher = async (teacherId: string): Promise<Exam[]> => {
  const q = query(collection(db, 'exams'), where('createdBy', '==', teacherId));

  const snapshot = await getDocs(q);
  const exams = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      title: data.title || '',
      description: data.description,
      timeLimit: data.timeLimit || 45,
      questions: data.questions || [],
      sections: data.sections || [],
      answers: data.answers || {},
      images: data.images,
      createdBy: data.createdBy || '',
      pointsConfig: data.pointsConfig,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    };
  });

  exams.sort((a, b) => {
    const dateA = a.createdAt?.getTime() || 0;
    const dateB = b.createdAt?.getTime() || 0;
    return dateB - dateA;
  });

  return exams;
};

// ✅✅✅ SỬA: Xóa exam + subcollection images ✅✅✅
export const deleteExam = async (examId: string): Promise<void> => {
  // Xóa subcollection images trước
  try {
    const imagesSnap = await getDocs(collection(db, 'exams', examId, 'images'));
    if (!imagesSnap.empty) {
      const batch = writeBatch(db);
      imagesSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`🗑️ Deleted ${imagesSnap.size} images from subcollection`);
    }
  } catch (err) {
    console.warn('Failed to delete images subcollection:', err);
  }

  // Xóa document chính
  await deleteDoc(doc(db, 'exams', examId));
};

// ============ ROOM FUNCTIONS ============

const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const isRoomCodeUnique = async (code: string): Promise<boolean> => {
  const q = query(collection(db, 'rooms'), where('code', '==', code));
  const snapshot = await getDocs(q);
  return snapshot.empty;
};

export const createRoom = async (roomData: {
  examId: string;
  examTitle: string;
  teacherId: string;
  teacherName: string;
  timeLimit: number;
  classId?: string;
  className?: string;
  opensAt?: Date | null;
  closesAt?: Date | null;

  settings?: {
    allowLateJoin?: boolean;
    showResultAfterSubmit?: boolean;
    shuffleQuestions?: boolean;
    maxAttempts?: number;
    allowAnonymous?: boolean;
    showCorrectAnswers?: boolean;
    showExplanations?: boolean;
  };
}): Promise<Room> => {
  let code = generateRoomCode();
  let attempts = 0;
  while (!(await isRoomCodeUnique(code)) && attempts < 10) {
    code = generateRoomCode();
    attempts++;
  }

  const settings = {
    allowLateJoin: roomData.settings?.allowLateJoin ?? true,
    showResultAfterSubmit: roomData.settings?.showResultAfterSubmit ?? true,
    shuffleQuestions: roomData.settings?.shuffleQuestions ?? false,
    maxAttempts: roomData.settings?.maxAttempts ?? 1,
    allowAnonymous: roomData.settings?.allowAnonymous ?? false,
    showCorrectAnswers: roomData.settings?.showCorrectAnswers ?? true,
    showExplanations: roomData.settings?.showExplanations ?? true
  };

  const baseRoom = {
    code,
    examId: roomData.examId,
    examTitle: roomData.examTitle,
    teacherId: roomData.teacherId,
    teacherName: roomData.teacherName,
    status: 'waiting' as const,
    timeLimit: roomData.timeLimit,
    opensAt: roomData.opensAt ?? undefined,
    closesAt: roomData.closesAt ?? undefined,

    settings,

    allowLateJoin: settings.allowLateJoin,
    showResultAfterSubmit: settings.showResultAfterSubmit,
    shuffleQuestions: settings.shuffleQuestions,
    maxAttempts: settings.maxAttempts,
    allowAnonymous: settings.allowAnonymous,

    totalStudents: 0,
    submittedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const room: Omit<Room, 'id'> = {
    ...baseRoom,
    ...(roomData.classId && { classId: roomData.classId }),
    ...(roomData.className && { className: roomData.className })
  };

  const firestoreData: any = {
    ...room,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  Object.keys(firestoreData).forEach((key) => {
    if (firestoreData[key] === undefined) {
      delete firestoreData[key];
    }
  });

  const roomRef = await addDoc(collection(db, 'rooms'), firestoreData);

  return { id: roomRef.id, ...room };
};

const parseRoomData = (id: string, data: DocumentData): Room => {
  const settings = data.settings || {};

  return {
    id,
    code: data.code || '',
    examId: data.examId || '',
    examTitle: data.examTitle || '',
    teacherId: data.teacherId || '',
    teacherName: data.teacherName || '',
    classId: data.classId,
    className: data.className,
    status: data.status || 'waiting',
    startTime: toDate(data.startTime),
    endTime: toDate(data.endTime),
    timeLimit: data.timeLimit || 45,

    settings: {
      allowLateJoin: settings.allowLateJoin ?? data.allowLateJoin ?? true,
      showResultAfterSubmit: settings.showResultAfterSubmit ?? data.showResultAfterSubmit ?? true,
      shuffleQuestions: settings.shuffleQuestions ?? data.shuffleQuestions ?? false,
      maxAttempts: settings.maxAttempts ?? data.maxAttempts ?? 1,
      allowAnonymous: settings.allowAnonymous ?? data.allowAnonymous ?? false,
      showCorrectAnswers: settings.showCorrectAnswers ?? true,
      showExplanations: settings.showExplanations ?? true
    },

    allowLateJoin: settings.allowLateJoin ?? data.allowLateJoin ?? true,
    showResultAfterSubmit: settings.showResultAfterSubmit ?? data.showResultAfterSubmit ?? true,
    shuffleQuestions: settings.shuffleQuestions ?? data.shuffleQuestions ?? false,
    maxAttempts: settings.maxAttempts ?? data.maxAttempts ?? 1,
    allowAnonymous: settings.allowAnonymous ?? data.allowAnonymous ?? false,

    totalStudents: data.totalStudents || 0,
    submittedCount: data.submittedCount || 0,
    opensAt: toDate(data.opensAt),
    closesAt: toDate(data.closesAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
  };
};

export const getRoomByCode = async (code: string): Promise<Room | null> => {
  const q = query(collection(db, 'rooms'), where('code', '==', code.toUpperCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return parseRoomData(docSnap.id, docSnap.data());
};

export const getRoom = async (roomId: string): Promise<Room | null> => {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);

  if (roomSnap.exists()) {
    return parseRoomData(roomSnap.id, roomSnap.data());
  }
  return null;
};

export const getRoomsByTeacher = async (teacherId: string): Promise<Room[]> => {
  const q = query(collection(db, 'rooms'), where('teacherId', '==', teacherId));

  const snapshot = await getDocs(q);
  const rooms = snapshot.docs.map((docSnap) => parseRoomData(docSnap.id, docSnap.data()));

  rooms.sort((a, b) => {
    const dateA = a.createdAt?.getTime() || 0;
    const dateB = b.createdAt?.getTime() || 0;
    return dateB - dateA;
  });

  return rooms;
};

export const updateRoomStatus = async (roomId: string, status: Room['status']): Promise<void> => {
  const roomRef = doc(db, 'rooms', roomId);
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp()
  };

  if (status === 'active') {
    updateData.startTime = serverTimestamp();
  } else if (status === 'closed') {
    updateData.endTime = serverTimestamp();
  }

  await updateDoc(roomRef, updateData);
};

export const deleteRoom = async (roomId: string): Promise<void> => {
  const q = query(collection(db, 'submissions'), where('roomId', '==', roomId));
  const snapshot = await getDocs(q);

  const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
  await Promise.all(deletePromises);

  await deleteDoc(doc(db, 'rooms', roomId));
};

export const subscribeToRoom = (roomId: string, callback: (room: Room | null) => void) => {
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(parseRoomData(docSnap.id, docSnap.data()));
    } else {
      callback(null);
    }
  });
};

// ============ USER MANAGEMENT (Admin) ============

export const getAllUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || '',
      email: data.email,
      avatar: data.avatar,
      role: data.role || Role.TEACHER,
      isApproved: data.isApproved ?? false,
      createdAt: toDate(data.createdAt),
      classIds: data.classIds || []
    };
  });
};

export const getPendingUsers = async (): Promise<User[]> => {
  const q = query(collection(db, 'users'), where('isApproved', '==', false));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name || '',
      email: data.email,
      avatar: data.avatar,
      role: data.role || Role.TEACHER,
      isApproved: false,
      createdAt: toDate(data.createdAt),
      classIds: data.classIds || []
    };
  });
};

export const approveUser = async (userId: string): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { isApproved: true });
};

export const rejectUser = async (userId: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', userId));
};

export const updateUserRole = async (userId: string, role: Role): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { role });
};

export const updateSubmission = async (submissionId: string, data: Partial<Submission>): Promise<void> => {
  const submissionRef = doc(db, 'submissions', submissionId);
  await updateDoc(submissionRef, data as Record<string, unknown>);
};
// ════════════════════════════════════════════════════════════════════
// ADDITIONS TO firebaseService.ts
// Thêm 2 hàm mới vào cuối file, sau hàm getStudentSubmission
// ════════════════════════════════════════════════════════════════════

// ✅ MỚI: Lấy TẤT CẢ bài làm của học sinh trong 1 phòng (hỗ trợ multi-attempt)
export const getStudentSubmissionsForRoom = async (
  roomId: string,
  studentId: string
): Promise<Submission[]> => {
  const q = query(
    collection(db, 'submissions'),
    where('roomId', '==', roomId),
    where('student.id', '==', studentId)
  );

  const snapshot = await getDocs(q);
  const submissions = snapshot.docs.map((docSnap) =>
    parseSubmissionData(docSnap.id, docSnap.data())
  );

  // Sắp xếp theo thời gian nộp, mới nhất trước
  return submissions.sort(
    (a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0)
  );
};

// ✅ MỚI: Lấy số lần đã thi + điểm cao nhất của học sinh trong 1 phòng
export const getStudentAttemptInfo = async (
  roomId: string,
  studentId: string
): Promise<{
  attemptCount: number;           // Số lần đã nộp bài
  bestScore: number | null;       // Điểm cao nhất
  lastSubmission: Submission | null; // Lần nộp gần nhất
}> => {
  const submissions = await getStudentSubmissionsForRoom(roomId, studentId);
  const submitted = submissions.filter((s) => s.status === 'submitted');

  if (submitted.length === 0) {
    return { attemptCount: 0, bestScore: null, lastSubmission: null };
  }

  const bestScore = Math.max(...submitted.map((s) => s.totalScore));
  const lastSubmission = submitted[0]; // đã sort desc

  return {
    attemptCount: submitted.length,
    bestScore,
    lastSubmission,
  };
};

// ════════════════════════════════════════════════════════════════════
// THAY THẾ hàm getStudentSubmission cũ bằng version biết về multi-attempt:
// (Giữ nguyên hàm cũ để backward-compat, thêm hàm mới bên dưới)
// ════════════════════════════════════════════════════════════════════

// ✅ MỚI: Kiểm tra học sinh còn lần thi nào không
// Trả về:
//   canAttempt: true nếu còn lần thi
//   reason: lý do nếu không thể thi
//   attemptCount: số lần đã thi
//   maxAttempts: giới hạn (0 = không giới hạn)
export const checkCanAttempt = async (
  room: { id: string; settings?: { maxAttempts?: number } },
  studentId: string
): Promise<{
  canAttempt: boolean;
  reason?: string;
  attemptCount: number;
  maxAttempts: number;
}> => {
  const maxAttempts = room.settings?.maxAttempts ?? 1;

  const { attemptCount } = await getStudentAttemptInfo(room.id, studentId);

  // 0 = không giới hạn
  if (maxAttempts === 0) {
    return { canAttempt: true, attemptCount, maxAttempts };
  }

  if (attemptCount >= maxAttempts) {
    return {
      canAttempt: false,
      reason:
        maxAttempts === 1
          ? 'Bạn đã nộp bài rồi! Phòng này chỉ cho phép thi 1 lần.'
          : `Bạn đã thi ${attemptCount}/${maxAttempts} lần. Đã hết lượt thi.`,
      attemptCount,
      maxAttempts,
    };
  }

  return { canAttempt: true, attemptCount, maxAttempts };
};
