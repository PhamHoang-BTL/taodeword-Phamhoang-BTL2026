// services/questionBankService.ts
/**
 * Ngân hàng câu hỏi — Firebase CRUD Service
 *
 * Cấu trúc Firestore:
 *   questionBank/{qId}   — metadata + text + options
 *   questionBank/{qId}/images/{imgDocId}  — base64 ảnh (chunked)
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebaseService';
import type { QuestionOption, QuestionType, ImageData } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BankQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'writing';

export type DifficultyLevel =
  | 'Nhận biết'
  | 'Thông hiểu'
  | 'Vận dụng'
  | 'Vận dụng cao';

export interface BankQuestion {
  id: string;            // Firestore doc ID
  teacherId: string;
  grade: string;         // '6'…'12'
  topic: string;
  level: DifficultyLevel;
  type: BankQuestionType;
  text: string;          // HTML / LaTeX text
  options: QuestionOption[];
  correctAnswer: string | null;
  solution: string;
  images: BankImage[];   // lightweight — base64 loaded on demand
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight image reference (base64 may be empty until loaded) */
export interface BankImage {
  id: string;
  contentType: string;
  base64: string;        // may be '' until loadQuestionImages() is called
}

export interface BankFilter {
  teacherId?: string;
  grade?: string;
  topic?: string;      // single topic (backward compat)
  topics?: string[];   // ✅ NEW: multiple topics (uses Firestore 'in' operator)
  level?: string;
  type?: string;
}

export interface ImportProgress {
  done: number;
  total: number;
  phase: 'images' | 'questions';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 750_000; // 750 KB per Firestore field

const sanitize = (obj: any): any => {
  if (obj === undefined || obj === null) return null;
  try {
    return JSON.parse(
      JSON.stringify(obj, (_k, v) => {
        if (v === undefined) return null;
        if (typeof v === 'number' && (isNaN(v) || !isFinite(v))) return 0;
        if (typeof v === 'function') return undefined;
        return v;
      })
    );
  } catch {
    return null;
  }
};

const toDate = (ts: any): Date => {
  if (!ts) return new Date();
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
};

// ─── Save images to subcollection ───────────────────────────────────────────

async function saveImagesToSubcollection(
  questionId: string,
  images: ImageData[]
): Promise<void> {
  const imagesCol = collection(db, 'questionBank', questionId, 'images');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const base64 = img.base64 || '';

    if (base64.length > CHUNK_SIZE) {
      const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
      for (let c = 0; c < totalChunks; c++) {
        const chunk = base64.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
        const d = sanitize({
          imageIndex: i,
          id: img.id,
          contentType: img.contentType || 'image/png',
          base64: chunk,
          chunkIndex: c,
          totalChunks,
        });
        if (d) await addDoc(imagesCol, d);
      }
    } else {
      const d = sanitize({
        imageIndex: i,
        id: img.id,
        contentType: img.contentType || 'image/png',
        base64,
        chunkIndex: 0,
        totalChunks: 1,
      });
      if (d) await addDoc(imagesCol, d);
    }
  }
}

// ─── Delete images subcollection ────────────────────────────────────────────

async function deleteImagesSubcollection(questionId: string): Promise<void> {
  const snap = await getDocs(
    collection(db, 'questionBank', questionId, 'images')
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// ─── Load images from subcollection ────────────────────────────────────────

async function loadImagesFromSubcollection(
  questionId: string
): Promise<BankImage[]> {
  const snap = await getDocs(
    collection(db, 'questionBank', questionId, 'images')
  );
  if (snap.empty) return [];

  // Group chunks by imageIndex + id
  type ChunkInfo = {
    imageIndex: number;
    id: string;
    contentType: string;
    chunkIndex: number;
    totalChunks: number;
    base64: string;
  };
  const chunks: ChunkInfo[] = snap.docs.map((d) => d.data() as ChunkInfo);

  const map = new Map<string, ChunkInfo[]>();
  for (const c of chunks) {
    const key = `${c.imageIndex}_${c.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  const result: BankImage[] = [];
  for (const [, chs] of map) {
    chs.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
    result.push({
      id: chs[0].id,
      contentType: chs[0].contentType || 'image/png',
      base64: chs.map((c) => c.base64 || '').join(''),
    });
  }

  result.sort((a, b) => {
    const ai = chunks.find((c) => c.id === a.id)?.imageIndex || 0;
    const bi = chunks.find((c) => c.id === b.id)?.imageIndex || 0;
    return ai - bi;
  });

  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Save a single question to the bank.
 * Returns the new document ID.
 */
export async function saveBankQuestion(
  data: Omit<BankQuestion, 'id' | 'createdAt' | 'updatedAt'>,
  images: ImageData[] = []
): Promise<string> {
  const hasImages = images.some((img) => img.base64 && img.base64.length > 0);

  // Strip base64 from main doc
  const docData = sanitize({
    teacherId: data.teacherId,
    grade: data.grade,
    topic: data.topic || '',
    level: data.level || 'Nhận biết',
    type: data.type,
    text: data.text,
    options: (data.options || []).map((o) => ({
      letter: o.letter,
      text: o.text,
      isCorrect: o.isCorrect ?? false,
    })),
    correctAnswer: data.correctAnswer ?? null,
    solution: data.solution || '',
    tags: data.tags || [],
    hasImages,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(db, 'questionBank'), docData);

  if (hasImages) {
    await saveImagesToSubcollection(ref.id, images);
  }

  return ref.id;
}

/**
 * Update an existing bank question.
 */
export async function updateBankQuestion(
  id: string,
  data: Partial<Omit<BankQuestion, 'id' | 'createdAt' | 'updatedAt'>>,
  newImages?: ImageData[]
): Promise<void> {
  const hasImages =
    newImages !== undefined
      ? newImages.some((img) => img.base64 && img.base64.length > 0)
      : undefined;

  const update: any = {
    updatedAt: serverTimestamp(),
  };

  if (data.text !== undefined) update.text = data.text;
  if (data.options !== undefined)
    update.options = (data.options || []).map((o) => ({
      letter: o.letter,
      text: o.text,
      isCorrect: o.isCorrect ?? false,
    }));
  if (data.correctAnswer !== undefined) update.correctAnswer = data.correctAnswer ?? null;
  if (data.solution !== undefined) update.solution = data.solution || '';
  if (data.grade !== undefined) update.grade = data.grade;
  if (data.topic !== undefined) update.topic = data.topic || '';
  if (data.level !== undefined) update.level = data.level;
  if (data.type !== undefined) update.type = data.type;
  if (data.tags !== undefined) update.tags = data.tags || [];
  if (hasImages !== undefined) update.hasImages = hasImages;

  await updateDoc(doc(db, 'questionBank', id), sanitize(update) || {});

  if (newImages !== undefined) {
    await deleteImagesSubcollection(id);
    if (hasImages) {
      await saveImagesToSubcollection(id, newImages);
    }
  }
}

/**
 * Delete a bank question and its images.
 */
export async function deleteBankQuestion(id: string): Promise<void> {
  await deleteImagesSubcollection(id);
  await deleteDoc(doc(db, 'questionBank', id));
}

/**
 * Load images for a specific question (on demand).
 */
export async function loadQuestionImages(id: string): Promise<BankImage[]> {
  return loadImagesFromSubcollection(id);
}

/**
 * Parse a Firestore document into a BankQuestion (without images).
 */
function parseDoc(id: string, data: any): BankQuestion {
  return {
    id,
    teacherId: data.teacherId || '',
    grade: data.grade || '',
    topic: data.topic || '',
    level: (data.level || 'Nhận biết') as DifficultyLevel,
    type: (data.type || 'multiple_choice') as BankQuestionType,
    text: data.text || '',
    options: (data.options || []).map((o: any) => ({
      letter: o.letter || '',
      text: o.text || '',
      isCorrect: o.isCorrect ?? false,
    })),
    correctAnswer: data.correctAnswer ?? null,
    solution: data.solution || '',
    images: [],
    tags: data.tags || [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Get questions from the bank with optional filters.
 */
export async function getBankQuestions(
  filter: BankFilter = {}
): Promise<BankQuestion[]> {
  let q: any = collection(db, 'questionBank');

  const constraints: any[] = [];

  if (filter.teacherId) constraints.push(where('teacherId', '==', filter.teacherId));
  if (filter.grade) constraints.push(where('grade', '==', filter.grade));

  // ✅ Multi-topic support: use Firestore 'in' operator (max 30 items)
  if (filter.topics && filter.topics.length > 0) {
    constraints.push(where('topic', 'in', filter.topics.slice(0, 30)));
  } else if (filter.topic) {
    constraints.push(where('topic', '==', filter.topic));
  }

  if (filter.level) constraints.push(where('level', '==', filter.level));
  if (filter.type) constraints.push(where('type', '==', filter.type));

  constraints.push(orderBy('createdAt', 'desc'));

  try {
    const snap = await getDocs(query(q, ...constraints));
    return snap.docs.map((d) => parseDoc(d.id, d.data()));
  } catch {
    // Firestore index may not be ready — fallback without orderBy
    const snap = await getDocs(
      constraints.length > 1
        ? query(q, ...constraints.slice(0, -1))
        : q
    );
    const results = snap.docs.map((d) => parseDoc(d.id, d.data()));
    results.sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
    return results;
  }
}

/**
 * Get all unique topics for a teacher / grade.
 */
export async function getBankTopics(
  teacherId: string,
  grade?: string
): Promise<string[]> {
  const constraints: any[] = [where('teacherId', '==', teacherId)];
  if (grade) constraints.push(where('grade', '==', grade));

  const snap = await getDocs(query(collection(db, 'questionBank'), ...constraints));
  const topics = new Set<string>();
  snap.docs.forEach((d) => {
    const t = d.data().topic;
    if (t) topics.add(t);
  });
  return Array.from(topics).sort();
}

/**
 * Import a batch of questions from a parsed Word file.
 * Returns count of saved questions.
 */
export async function importQuestionsToBank(
  questions: Array<{
    type: BankQuestionType;
    text: string;
    options: QuestionOption[];
    correctAnswer: string | null;
    solution: string;
    images: ImageData[];
  }>,
  meta: { teacherId: string; grade: string; topic: string; level: DifficultyLevel },
  onProgress?: (p: ImportProgress) => void
): Promise<number> {
  let done = 0;
  for (const q of questions) {
    await saveBankQuestion(
      {
        teacherId: meta.teacherId,
        grade: meta.grade,
        topic: meta.topic,
        level: meta.level,
        type: q.type,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        solution: q.solution,
        images: [],
        tags: [],
      },
      q.images
    );
    done++;
    onProgress?.({ done, total: questions.length, phase: 'questions' });
  }
  return done;
}

// ─── Convert BankQuestion[] → ExamData format ────────────────────────────────

import type { ExamData, Question } from '../types';

/**
 * Convert selected BankQuestions (with images already loaded) into ExamData
 * that can be fed into createExam().
 */
export function bankQuestionsToExamData(
  selectedQuestions: BankQuestion[],
  loadedImages: Record<string, BankImage[]> // questionId → images
): ExamData {
  // ✅ Sắp xếp câu hỏi theo thứ tự loại (MC → TF → SA → Writing)
  const TYPE_ORDER: Record<string, number> = {
    'multiple_choice': 1,
    'true_false':      2,
    'short_answer':    3,
    'writing':         4,
  };
  const sortedInput = [...selectedQuestions].sort(
    (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
  );

  // ✅ FIX ROOT CAUSE: Đánh số câu theo dải phần để scoringService.detectSections
  // (dùng Math.floor(q.number / 100)) nhận diện đúng từng phần:
  //   MC  → 101, 102, 103...  (Math.floor(101/100) = 1 → part1 → MC)
  //   TF  → 201, 202, 203...  (Math.floor(201/100) = 2 → part2 → TF)
  //   SA  → 301, 302, 303...  (Math.floor(301/100) = 3 → part3 → SA)
  // Khi thi, ExamRoom hiển thị displayNum 1,2,3... (không phụ thuộc q.number)
  const TYPE_BASE: Record<string, number> = {
    'multiple_choice': 100,
    'true_false':      200,
    'short_answer':    300,
    'writing':         400,
  };
  const typeCounters: Record<string, number> = {};

  const allImages: ImageData[] = [];
  const questions: Question[] = [];

  for (const bq of sortedInput) {
    typeCounters[bq.type] = (typeCounters[bq.type] ?? 0) + 1;
    // q.number ví dụ: MC → 101,102...; TF → 201,202...; SA → 301,302...
    const questionNumber = (TYPE_BASE[bq.type] ?? 100) + typeCounters[bq.type];

    const imgs = loadedImages[bq.id] || [];
    const imgPrefix = `q${questionNumber}`;

    // Remap image IDs to avoid collisions
    const remappedImages: ImageData[] = imgs.map((img, i) => ({
      id: `${imgPrefix}_img${i}`,
      filename: `${img.id}.png`,
      base64: img.base64,
      contentType: img.contentType,
    }));

    // Update question text to reference new image IDs
    let text = bq.text;
    imgs.forEach((img, i) => {
      text = text.replace(
        new RegExp(img.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        `${imgPrefix}_img${i}`
      );
    });

    // Remap option texts too
    const options = bq.options.map((o) => {
      let optText = o.text;
      imgs.forEach((img, i) => {
        optText = optText.replace(
          new RegExp(img.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          `${imgPrefix}_img${i}`
        );
      });
      return { ...o, text: optText };
    });

    allImages.push(...remappedImages);

    questions.push({
      number: questionNumber,   // ← dải số: MC=101-1xx, TF=201-2xx, SA=301-3xx
      part: typeToPartName(bq.type),
      type: bq.type as any,
      text,
      options,
      correctAnswer: bq.correctAnswer,
      solution: bq.solution,
      images: remappedImages,
    } as unknown as Question);
  }

  // Build answers map (key = q.number)
  const answers: Record<number, string> = {};
  questions.forEach((q) => {
    if (q.correctAnswer) answers[q.number] = q.correctAnswer;
  });

  // ✅ Sections theo format mergeExamsService: questionType + startNumber/endNumber
  const mcQs = questions.filter((q) => q.type === 'multiple_choice');
  const tfQs = questions.filter((q) => q.type === 'true_false');
  const saQs = questions.filter((q) => q.type === 'short_answer');
  const wrQs = questions.filter((q) => q.type === 'writing');

  const builtSections: ExamData['sections'] = [];

  if (mcQs.length > 0) {
    builtSections.push({
      id: 'mc',
      name: 'Phần 1. Trắc nghiệm nhiều lựa chọn',
      questionType: 'multiple_choice',
      startNumber: 101,
      endNumber:   100 + mcQs.length,
    } as any);
  }
  if (tfQs.length > 0) {
    builtSections.push({
      id: 'tf',
      name: 'Phần 2. Đúng / Sai',
      questionType: 'true_false',
      startNumber: 201,
      endNumber:   200 + tfQs.length,
    } as any);
  }
  if (saQs.length > 0) {
    builtSections.push({
      id: 'sa',
      name: 'Phần 3. Trả lời ngắn',
      questionType: 'short_answer',
      startNumber: 301,
      endNumber:   300 + saQs.length,
    } as any);
  }
  if (wrQs.length > 0) {
    builtSections.push({
      id: 'wr',
      name: 'Phần 4. Tự luận',
      questionType: 'writing',
      startNumber: 401,
      endNumber:   400 + wrQs.length,
    } as any);
  }

  return {
    title: '',
    questions,
    sections: builtSections,
    answers,
    // ✅ FIX: KHÔNG truyền top-level `images` vào ExamData.
    // Nếu truyền cùng ảnh ở cả q.images VÀ examData.images, extractImagesFromExam
    // sẽ lưu ảnh 2 lần vào subcollection (questionNumber=101 và questionNumber=0),
    // gây conflict key trong mergeImagesIntoExam và ảnh không hiển thị.
    // Ảnh chỉ cần trong q.images — extractImagesFromExam sẽ xử lý đúng.
    images: [],
    timeLimit: 45,
  };
}

function typeToPartName(type: BankQuestionType): string {
  switch (type) {
    case 'multiple_choice': return 'PHẦN 1';
    case 'true_false':      return 'PHẦN 2';
    case 'short_answer':    return 'PHẦN 3';
    case 'writing':         return 'PHẦN 4';
    default:                return 'PHẦN 1';
  }
}
