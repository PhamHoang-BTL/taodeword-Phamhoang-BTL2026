// ============================================================
// studentAccountService.ts
// Quản lý tài khoản học sinh do giáo viên tạo (username/password)
// ============================================================

// ✅ writeBatch import trực tiếp từ firebase/firestore
// vì firebaseService.ts không re-export nó
import { writeBatch } from 'firebase/firestore';

import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  ensureSignedIn,
  addStudentToClass,
  removeStudentFromClass,
} from './firebaseService';

import {
  Role,
  User,
  StudentAccount,
  CreateStudentAccountInput,
  BulkImportStudentRow,
  BulkImportResult,
} from '../types';

type CreateStudentInput = CreateStudentAccountInput;
type BulkImportRow = BulkImportStudentRow;

// ============ HELPERS ============

export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const isValidUsername = (username: string): boolean => {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
};

// ============ CRUD ============

export const createStudentAccount = async (
  input: CreateStudentInput
): Promise<StudentAccount> => {
  const username = input.username.trim().toLowerCase();

  if (!isValidUsername(username)) {
    throw new Error(
      `Tên đăng nhập "${username}" không hợp lệ. Chỉ dùng chữ cái, số, dấu _, độ dài 3-30 ký tự.`
    );
  }
  if (!input.password || input.password.length < 4) {
    throw new Error('Mật khẩu phải có ít nhất 4 ký tự.');
  }

  const docRef = doc(db, 'studentAccounts', username);
  const existing = await getDoc(docRef);
  if (existing.exists()) {
    throw new Error(`Tên đăng nhập "${username}" đã tồn tại.`);
  }

  const passwordHash = await hashPassword(input.password);

  const account: StudentAccount = {
    id: username,
    username,
    passwordHash,
    name: input.name.trim(),
    classId: input.classId,
    className: input.className,
    teacherId: input.teacherId,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, account);

  const userId = `student_${username}`;
  await setDoc(doc(db, 'users', userId), {
    id: userId,
    name: input.name.trim(),
    role: Role.STUDENT,
    isApproved: true,
    classIds: input.classId ? [input.classId] : [],
    createdAt: serverTimestamp(),
  });

  if (input.classId) {
    await addStudentToClass(input.classId, userId);
  }

  return account;
};

export const loginWithStudentAccount = async (
  username: string,
  password: string
): Promise<User | null> => {
  await ensureSignedIn();

  const uname = username.trim().toLowerCase();
  const snap = await getDoc(doc(db, 'studentAccounts', uname));
  if (!snap.exists()) return null;

  const account = snap.data() as StudentAccount;
  if (!account.isActive) {
    throw new Error('Tài khoản đã bị vô hiệu hóa. Liên hệ giáo viên.');
  }

  const inputHash = await hashPassword(password);
  if (inputHash !== account.passwordHash) return null;

  return {
    id: `student_${uname}`,
    name: account.name,
    role: Role.STUDENT,
    isApproved: true,
    classIds: account.classId ? [account.classId] : [],
  };
};

export const getStudentAccountByUsername = async (
  username: string
): Promise<StudentAccount | null> => {
  const snap = await getDoc(doc(db, 'studentAccounts', username.trim().toLowerCase()));
  if (!snap.exists()) return null;
  return snap.data() as StudentAccount;
};

export const getStudentAccountsByTeacher = async (
  teacherId: string
): Promise<StudentAccount[]> => {
  const q = query(
    collection(db, 'studentAccounts'),
    where('teacherId', '==', teacherId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as StudentAccount);
};

export const deleteStudentAccount = async (username: string): Promise<void> => {
  const userId = `student_${username}`;
  const snap = await getDoc(doc(db, 'studentAccounts', username));
  if (snap.exists()) {
    const account = snap.data() as StudentAccount;
    if (account.classId) {
      await removeStudentFromClass(account.classId, userId);
    }
  }
  await deleteDoc(doc(db, 'users', userId));
  await deleteDoc(doc(db, 'studentAccounts', username));
};

export const resetStudentPassword = async (
  username: string,
  newPassword: string
): Promise<void> => {
  if (!newPassword || newPassword.length < 4) {
    throw new Error('Mật khẩu phải có ít nhất 4 ký tự.');
  }
  const passwordHash = await hashPassword(newPassword);
  await updateDoc(doc(db, 'studentAccounts', username), {
    passwordHash,
    updatedAt: serverTimestamp(),
  });
};

export const toggleStudentAccountStatus = async (
  username: string,
  isActive: boolean
): Promise<void> => {
  await updateDoc(doc(db, 'studentAccounts', username), {
    isActive,
    updatedAt: serverTimestamp(),
  });
};

export const bulkCreateStudentAccounts = async (
  rows: BulkImportRow[],
  teacherId: string,
  availableClasses: { id: string; name: string }[],
  defaultClassId?: string
): Promise<BulkImportResult> => {
  const result: BulkImportResult = { success: 0, failed: 0, errors: [] };
  const batch = writeBatch(db);  // ✅ dùng writeBatch từ firebase/firestore trực tiếp
  const processed: string[] = [];

  const classMap = new Map<string, { id: string; name: string }>();
  for (const cls of availableClasses) {
    classMap.set(cls.name.trim().toLowerCase(), cls);
  }
  const defaultClass = availableClasses.find((c) => c.id === defaultClassId);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;

    try {
      if (!row.name?.trim()) throw new Error(`Dòng ${lineNum}: Thiếu họ tên`);
      if (!row.username?.trim()) throw new Error(`Dòng ${lineNum}: Thiếu tên đăng nhập`);
      if (!row.password?.trim()) throw new Error(`Dòng ${lineNum}: Thiếu mật khẩu`);

      const username = String(row.username).trim().toLowerCase();
      if (!isValidUsername(username))
        throw new Error(`Dòng ${lineNum}: Tên đăng nhập "${username}" không hợp lệ`);
      if (processed.includes(username))
        throw new Error(`Dòng ${lineNum}: Tên đăng nhập "${username}" bị trùng trong file`);

      const existing = await getDoc(doc(db, 'studentAccounts', username));
      if (existing.exists())
        throw new Error(`Dòng ${lineNum}: "${username}" đã tồn tại trong hệ thống`);

      let resolvedClassId: string | undefined;
      let resolvedClassName: string | undefined;

      const rowClassName = row.className?.trim();
      if (rowClassName) {
        const found = classMap.get(rowClassName.toLowerCase());
        if (!found) {
          throw new Error(
            `Dòng ${lineNum}: Lớp "${rowClassName}" chưa tồn tại — hãy tạo lớp này trước`
          );
        }
        resolvedClassId = found.id;
        resolvedClassName = found.name;
      } else if (defaultClass) {
        resolvedClassId = defaultClass.id;
        resolvedClassName = defaultClass.name;
      }

      const passwordHash = await hashPassword(String(row.password).trim());

      const account: StudentAccount = {
        id: username,
        username,
        passwordHash,
        name: row.name.trim(),
        classId: resolvedClassId,
        className: resolvedClassName,
        teacherId,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const userId = `student_${username}`;
      batch.set(doc(db, 'studentAccounts', username), account);
      batch.set(doc(db, 'users', userId), {
        id: userId,
        name: row.name.trim(),
        role: Role.STUDENT,
        isApproved: true,
        classIds: resolvedClassId ? [resolvedClassId] : [],
        createdAt: serverTimestamp(),
      });

      processed.push(username);
      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push(err.message);
    }
  }

  if (result.success > 0) {
    await batch.commit();

    // Cập nhật classes.studentIds sau khi commit
    const classStudentMap = new Map<string, string[]>();
    for (const row of rows) {
      const username = String(row.username).trim().toLowerCase();
      if (!processed.includes(username)) continue;

      const rowClassName = row.className?.trim();
      let cId: string | undefined;
      if (rowClassName) {
        cId = classMap.get(rowClassName.toLowerCase())?.id;
      } else if (defaultClass) {
        cId = defaultClass.id;
      }

      if (cId) {
        if (!classStudentMap.has(cId)) classStudentMap.set(cId, []);
        classStudentMap.get(cId)!.push(`student_${username}`);
      }
    }

    for (const [cId, studentIds] of classStudentMap.entries()) {
      for (const studentId of studentIds) {
        try {
          await addStudentToClass(cId, studentId);
        } catch {
          // ignore nếu đã tồn tại
        }
      }
    }
  }

  return result;
};
