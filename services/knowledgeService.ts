// ============================================================
// knowledgeService.ts
// Quản lý kiến thức + AI tạo câu hỏi + AI nhận xét học sinh
// ============================================================

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
} from './firebaseService';

import {
  KnowledgeUnit,
  LearningObjective,
  Question,
  QuestionType,
  QuestionOption,
  Submission,
  Exam,
  ClassAssessmentReport,
  StudentAssessmentResult,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).slice(2, 10);

// ─── CRUD Knowledge Units ─────────────────────────────────────────────────

export const createKnowledgeUnit = async (
  data: Omit<KnowledgeUnit, 'id' | 'createdAt' | 'updatedAt'>
): Promise<KnowledgeUnit> => {
  const id = genId();
  const unit: KnowledgeUnit = {
    ...data,
    id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'knowledgeUnits', id), unit);
  return unit;
};

export const updateKnowledgeUnit = async (
  id: string,
  data: Partial<Omit<KnowledgeUnit, 'id' | 'createdAt'>>
): Promise<void> => {
  await updateDoc(doc(db, 'knowledgeUnits', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteKnowledgeUnit = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'knowledgeUnits', id));
};

export const getKnowledgeUnitsByTeacher = async (
  teacherId: string
): Promise<KnowledgeUnit[]> => {
  const q = query(
    collection(db, 'knowledgeUnits'),
    where('teacherId', '==', teacherId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as KnowledgeUnit);
};

export const getKnowledgeUnit = async (id: string): Promise<KnowledgeUnit | null> => {
  const snap = await getDoc(doc(db, 'knowledgeUnits', id));
  if (!snap.exists()) return null;
  return snap.data() as KnowledgeUnit;
};

// ─── AI: Tạo câu hỏi từ kiến thức ────────────────────────────────────────

export interface AIQuestionRequest {
  knowledgeUnit: KnowledgeUnit;
  questionType: QuestionType;
  count: number;            // số câu muốn tạo
  difficulty: string;       // 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao'
  additionalInstructions?: string;
}

export interface AIGeneratedQuestion {
  text: string;
  type: QuestionType;
  options?: { letter: string; text: string; isCorrect: boolean }[];
  correctAnswer: string | null;
  solution?: string;
  tfStatements?: { a: string; b: string; c: string; d: string };
  tfAnswers?: { a: boolean; b: boolean; c: boolean; d: boolean };
}

/**
 * Gọi Anthropic API để tạo câu hỏi từ nội dung kiến thức
 */
export const generateQuestionsWithAI = async (
  req: AIQuestionRequest
): Promise<AIGeneratedQuestion[]> => {
  const { knowledgeUnit, questionType, count, difficulty, additionalInstructions } = req;

  const typeInstruction = (() => {
    switch (questionType) {
      case 'multiple_choice':
        return `Tạo ${count} câu trắc nghiệm 4 lựa chọn (A, B, C, D), chỉ 1 đáp án đúng.
Mỗi câu có: text (câu hỏi), options (4 lựa chọn với letter A/B/C/D, text, isCorrect true/false), correctAnswer (A/B/C/D), solution (lời giải ngắn).`;

      case 'true_false':
        return `Tạo ${count} câu Đúng/Sai theo chuẩn BGD mới.
Mỗi câu có: text (dẫn nhập/tình huống), tfStatements (object với keys a, b, c, d — 4 mệnh đề), tfAnswers (object với keys a, b, c, d — true/false cho từng mệnh đề), correctAnswer (chuỗi "a,b" liệt kê mệnh đề đúng).`;

      case 'short_answer':
        return `Tạo ${count} câu trả lời ngắn (điền số, điền từ, kết quả tính toán).
Mỗi câu có: text (câu hỏi), correctAnswer (đáp án đúng, có thể là số hoặc từ ngắn), solution (lời giải chi tiết).`;

      default:
        return `Tạo ${count} câu hỏi dạng tự luận ngắn.
Mỗi câu có: text (câu hỏi), correctAnswer (gợi ý đáp án), solution (hướng dẫn giải).`;
    }
  })();

  const systemPrompt = `Bạn là trợ lý giáo dục chuyên tạo câu hỏi kiểm tra theo chuẩn Việt Nam.
Luôn trả về JSON hợp lệ, KHÔNG có markdown, KHÔNG có giải thích ngoài JSON.
Câu hỏi phải phù hợp với mức độ ${difficulty}, chính xác và rõ ràng.
Nếu dùng toán học, viết công thức rõ ràng bằng ký hiệu thông thường (không dùng LaTeX nâng cao).`;

  const userPrompt = `Kiến thức: ${knowledgeUnit.title}
Môn: ${knowledgeUnit.subject} | Lớp: ${knowledgeUnit.grade}
Nội dung:
${knowledgeUnit.content}

Mục tiêu học tập:
${knowledgeUnit.objectives.map((o) => `- ${o.description} (${o.level})`).join('\n')}

${additionalInstructions ? `Yêu cầu thêm: ${additionalInstructions}` : ''}

${typeInstruction}

Trả về JSON array: [{ type, text, options?, correctAnswer, solution?, tfStatements?, tfAnswers? }, ...]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.content?.find((c: any) => c.type === 'text')?.text || '[]';

  // Parse JSON — strip markdown code fences nếu có
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error('AI trả về định dạng không hợp lệ. Vui lòng thử lại.');
  }
};

// ─── AI: Nhận xét học sinh dựa trên kiến thức ────────────────────────────

export interface AssessmentRequest {
  knowledgeUnit: KnowledgeUnit;
  exam: Exam;
  submissions: Submission[];
  passingScore?: number; // % để đạt, mặc định 50
}

/**
 * Gọi AI để nhận xét học sinh dựa trên kiến thức và kết quả bài thi
 */
export const generateAIAssessment = async (
  req: AssessmentRequest
): Promise<ClassAssessmentReport> => {
  const { knowledgeUnit, exam, submissions, passingScore = 50 } = req;

  if (submissions.length === 0) {
    throw new Error('Không có bài nộp nào để nhận xét.');
  }

  // Chuẩn bị dữ liệu gửi AI
  const studentSummaries = submissions.map((sub) => ({
    name: sub.student.name,
    className: sub.student.className || '',
    percentage: sub.percentage,
    correctCount: sub.correctCount,
    totalQuestions: sub.totalQuestions,
    scoreByType: {
      multipleChoice: sub.scoreBreakdown?.multipleChoice,
      trueFalse: sub.scoreBreakdown?.trueFalse,
      shortAnswer: sub.scoreBreakdown?.shortAnswer,
    },
  }));

  const classAverage =
    submissions.reduce((sum, s) => sum + s.percentage, 0) / submissions.length;
  const passCount = submissions.filter((s) => s.percentage >= passingScore).length;
  const passRate = (passCount / submissions.length) * 100;

  const systemPrompt = `Bạn là chuyên gia giáo dục. Dựa trên kết quả bài thi và nội dung kiến thức, hãy nhận xét từng học sinh và cả lớp.
Luôn trả về JSON hợp lệ, KHÔNG có markdown, KHÔNG có giải thích ngoài JSON.
Nhận xét phải cụ thể, tích cực và có tính xây dựng theo phong cách giáo dục Việt Nam.`;

  const userPrompt = `
Bài kiểm tra: ${exam.title}
Đơn vị kiến thức: ${knowledgeUnit.title}
Môn: ${knowledgeUnit.subject} | Lớp: ${knowledgeUnit.grade}

Nội dung kiến thức:
${knowledgeUnit.content}

Mục tiêu học tập:
${knowledgeUnit.objectives.map((o) => `- ${o.description} (${o.level})`).join('\n')}

Ngưỡng đạt: ${passingScore}%
Điểm trung bình lớp: ${classAverage.toFixed(1)}%
Tỉ lệ đạt: ${passRate.toFixed(1)}%

Kết quả từng học sinh:
${JSON.stringify(studentSummaries, null, 2)}

Hãy trả về JSON theo cấu trúc:
{
  "aiSummary": "Nhận xét tổng quan về cả lớp (2-3 câu)",
  "commonWeakObjectives": ["Mục tiêu học sinh hay sai 1", "..."],
  "studentResults": [
    {
      "studentName": "...",
      "overallVerdict": "Đạt" | "Chưa đạt",
      "masteredObjectives": ["Mục tiêu đạt 1", "..."],
      "weakObjectives": ["Mục tiêu chưa đạt 1", "..."],
      "advice": "Lời khuyên cá nhân hóa ngắn gọn"
    }
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.content?.find((c: any) => c.type === 'text')?.text || '{}';

  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let aiResult: any;
  try {
    aiResult = JSON.parse(cleaned);
  } catch {
    throw new Error('AI trả về định dạng không hợp lệ. Vui lòng thử lại.');
  }

  // Ghép với dữ liệu thực tế
  const studentResults: StudentAssessmentResult[] = submissions.map((sub) => {
    const aiStudent = aiResult.studentResults?.find(
      (r: any) => r.studentName === sub.student.name
    );
    return {
      studentId: sub.student.id,
      studentName: sub.student.name,
      percentage: sub.percentage,
      masteredObjectives: aiStudent?.masteredObjectives || [],
      weakObjectives: aiStudent?.weakObjectives || [],
      overallVerdict: sub.percentage >= passingScore ? 'Đạt' : 'Chưa đạt',
      advice: aiStudent?.advice || '',
    };
  });

  return {
    knowledgeUnitTitle: knowledgeUnit.title,
    examTitle: exam.title,
    generatedAt: new Date(),
    classAverage,
    passRate,
    commonWeakObjectives: aiResult.commonWeakObjectives || [],
    studentResults,
    aiSummary: aiResult.aiSummary || '',
  };
};
