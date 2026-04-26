/**
 * Scoring Service v2 - Hệ thống tính điểm linh hoạt
 *
 * Hỗ trợ cấu hình điểm tùy chỉnh cho từng phần
 */

import { Exam, Question, ScoreBreakdown, ExamPointsConfig, SectionPointsConfig, TrueFalseMode } from '../types';

// Re-export để các component import được
export type { TrueFalseMode };

// ─── True/False answer parser ─────────────────────────────────────────────────
//
// Hỗ trợ 3 format (backward-compatible):
//
//   Format MỚI  : "a:T,b:F,c:T,d:F"   → parse tường minh T/F từng mệnh đề
//   Format CŨ 1 : "a,c"                → a,c = TRUE; còn lại = FALSE (logic cũ giữ nguyên)
//   Format CŨ 2 : {"a":true,"c":true}  → JSON object (học sinh nộp từ code cũ)
//
// Dùng parseTFAnswerStrict() thay vì tự viết lại để đảm bảo:
//   ✓ Submission cũ (format "a,c") → hành vi cũ hoàn toàn (điểm không thay đổi)
//   ✓ Submission mới (format "a:T,b:F,c:T,d:F") → hành vi mới (bỏ qua mệnh đề chưa chọn)
//
function parseTFAnswerStrict(
  answer: string | undefined,
  allLetters: string[]
): Record<string, 'T' | 'F'> {
  const map: Record<string, 'T' | 'F'> = {};
  if (!answer || !answer.trim()) return map;

  // ── Format MỚI: có dấu ":" → parse tường minh, undefined = chưa trả lời
  if (answer.includes(':')) {
    for (const part of answer.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (part.includes(':')) {
        const [letter, val] = part.split(':');
        if (letter && (val === 'T' || val === 'F')) {
          map[letter.toLowerCase()] = val;
        }
      }
    }
    // Trả về map — các letter không có = undefined = chưa trả lời
    return map;
  }

  // ── Format CŨ 2: JSON object {"a":true,"c":true}
  try {
    const parsed = JSON.parse(answer);
    if (typeof parsed === 'object' && parsed !== null) {
      const trueLetters = new Set(
        Object.keys(parsed)
          .filter((k) => parsed[k] === true)
          .map((k) => k.toLowerCase())
      );
      // Backward compat: điền đủ tất cả letters (không có = FALSE)
      for (const letter of allLetters) {
        map[letter] = trueLetters.has(letter) ? 'T' : 'F';
      }
      return map;
    }
  } catch {
    // không phải JSON
  }

  // ── Format CŨ 1: "a,c" → a,c = TRUE; còn lại = FALSE
  const trueLetters = new Set(
    answer
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  for (const letter of allLetters) {
    map[letter] = trueLetters.has(letter) ? 'T' : 'F';
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map QuestionType sang SectionPointsConfig questionType
 */
function mapQuestionType(type: string): 'multiple_choice' | 'true_false' | 'short_answer' {
  if (type === 'true_false') return 'true_false';
  if (type === 'short_answer' || type === 'writing') return 'short_answer';
  return 'multiple_choice';
}

/**
 * Phát hiện các section từ danh sách câu hỏi
 */
export function detectSections(questions: Question[]): SectionPointsConfig[] {
  const sections: SectionPointsConfig[] = [];
  const sectionMap = new Map<
    string,
    {
      type: 'multiple_choice' | 'true_false' | 'short_answer';
      count: number;
      part: number;
    }
  >();

  questions.forEach((q) => {
    const part = Math.floor(q.number / 100) || 1;
    const mappedType = mapQuestionType(q.type || 'multiple_choice');
    const key = `part${part}`;

    if (!sectionMap.has(key)) {
      sectionMap.set(key, { type: mappedType, count: 0, part });
    }
    sectionMap.get(key)!.count++;
  });

  sectionMap.forEach((data, key) => {
    const sectionNames: { [k: number]: string } = {
      1: 'PHẦN 1. TRẮC NGHIỆM NHIỀU LỰA CHỌN',
      2: 'PHẦN 2. TRẮC NGHIỆM ĐÚNG SAI',
      3: 'PHẦN 3. TRẢ LỜI NGẮN'
    };

    sections.push({
      sectionId: key,
      sectionName: sectionNames[data.part] || `Phần ${data.part}`,
      questionType: data.type,
      totalQuestions: data.count,
      totalPoints: 0,
      pointsPerQuestion: 0,
      trueFalseMode: data.type === 'true_false' ? 'stepped' : undefined
    });
  });

  return sections.sort((a, b) => {
    const partA = parseInt(a.sectionId.replace('part', ''));
    const partB = parseInt(b.sectionId.replace('part', ''));
    return partA - partB;
  });
}

/**
 * Tạo cấu hình điểm mặc định (thang 10)
 */
export function createDefaultPointsConfig(questions: Question[]): ExamPointsConfig {
  const sections = detectSections(questions);
  const maxScore = 10;
  const totalQuestions = Math.max(questions.length, 1);

  sections.forEach((section) => {
    const ratio = section.totalQuestions / totalQuestions;
    section.totalPoints = parseFloat((maxScore * ratio).toFixed(2));
    section.pointsPerQuestion = parseFloat((section.totalPoints / section.totalQuestions).toFixed(4));
  });

  const currentTotal = sections.reduce((sum, s) => sum + s.totalPoints, 0);
  if (sections.length > 0 && Math.abs(currentTotal - maxScore) > 0.01) {
    const diff = maxScore - currentTotal;
    const last = sections.length - 1;
    sections[last].totalPoints = parseFloat((sections[last].totalPoints + diff).toFixed(2));
    sections[last].pointsPerQuestion = parseFloat(
      (sections[last].totalPoints / sections[last].totalQuestions).toFixed(4)
    );
  }

  return { maxScore, sections, autoBalance: false };
}

/**
 * Cập nhật cấu hình điểm khi người dùng thay đổi
 */
export function updateSectionPoints(
  config: ExamPointsConfig,
  sectionId: string,
  newTotalPoints: number
): ExamPointsConfig {
  const sections = config.sections.map((s) => {
    if (s.sectionId === sectionId) {
      return {
        ...s,
        totalPoints: newTotalPoints,
        pointsPerQuestion: parseFloat((newTotalPoints / s.totalQuestions).toFixed(4))
      };
    }
    return s;
  });
  return { ...config, sections };
}

/**
 * Tính điểm cho câu Đúng/Sai
 *
 * mode = 'equal'   → mỗi ý đúng = maxPoints / 4  (chia đều)
 * mode = 'stepped' → thang bậc BGD:
 *   1 ý đúng  →  10%
 *   2 ý đúng  →  25%
 *   3 ý đúng  →  50%
 *   4 ý đúng  → 100%
 *   0 ý đúng  →   0%
 */
export function calculateTrueFalsePoints(
  correctCount: number,
  maxPointsPerQuestion: number,
  mode: TrueFalseMode = 'equal'
): number {
  if (correctCount <= 0) return 0;

  let ratio: number;

  if (mode === 'stepped') {
    const steppedRatios: Record<number, number> = {
      1: 0.10,
      2: 0.25,
      3: 0.50,
      4: 1.00
    };
    ratio = steppedRatios[correctCount] ?? 0;
  } else {
    ratio = correctCount / 4;
  }

  return parseFloat((maxPointsPerQuestion * ratio).toFixed(4));
}

/**
 * Chuẩn hóa đáp án
 */
function normalizeAnswer(answer: string): string {
  return answer.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').trim();
}

/**
 * Lấy cấu hình điểm cho một câu hỏi
 */
function getQuestionPointsConfig(
  question: Question,
  config?: ExamPointsConfig
): { points: number; tfMode: TrueFalseMode } {
  const defaultTfMode: TrueFalseMode = 'equal';

  if (!config) {
    const mappedType = mapQuestionType(question.type || 'multiple_choice');
    if (mappedType === 'multiple_choice') return { points: 0.25, tfMode: defaultTfMode };
    if (mappedType === 'true_false') return { points: 1.0, tfMode: defaultTfMode };
    if (mappedType === 'short_answer') return { points: 0.5, tfMode: defaultTfMode };
    return { points: 0, tfMode: defaultTfMode };
  }

  const part = Math.floor(question.number / 100) || 1;
  const sectionId = `part${part}`;
  const section = config.sections.find((s) => s.sectionId === sectionId);

  return {
    points: section?.pointsPerQuestion || 0,
    tfMode: section?.trueFalseMode ?? defaultTfMode
  };
}

/**
 * Tính điểm chi tiết cho bài làm (V2 - Linh hoạt)
 */
export function calculateScore(
  answers: { [questionNumber: number]: string },
  exam: Exam
): ScoreBreakdown {
  const config = exam.pointsConfig;

  const breakdown: ScoreBreakdown = {
    multipleChoice: { total: 0, correct: 0, points: 0, pointsPerQuestion: 0 },
    trueFalse: { total: 0, correct: 0, partial: 0, points: 0, pointsPerQuestion: 0, details: {} },
    shortAnswer: { total: 0, correct: 0, points: 0, pointsPerQuestion: 0 },
    totalScore: 0,
    percentage: 0
  };

  let mcPoints = 0, mcCount = 0;
  let tfPoints = 0, tfCount = 0;
  let saPoints = 0, saCount = 0;

  exam.questions.forEach((q) => {
    const userAnswer = answers[q.number];
    const correctAnswer = q.correctAnswer;
    const { points: pointsPerQuestion, tfMode } = getQuestionPointsConfig(q, config);
    const mappedType = mapQuestionType(q.type || 'multiple_choice');

    // === TRẮC NGHIỆM NHIỀU LỰA CHỌN ===
    if (mappedType === 'multiple_choice') {
      breakdown.multipleChoice.total++;
      mcCount++;
      mcPoints += pointsPerQuestion;

      if (userAnswer && correctAnswer) {
        if (userAnswer.toUpperCase() === correctAnswer.toUpperCase()) {
          breakdown.multipleChoice.correct++;
          breakdown.multipleChoice.points += pointsPerQuestion;
        }
      }
    }

    // === ĐÚNG SAI ===
    else if (mappedType === 'true_false') {
      breakdown.trueFalse.total++;
      tfCount++;
      tfPoints += pointsPerQuestion;

      if (correctAnswer) {
        // correctAnswer trong Firestore vẫn là format cũ "a,c"
        // → a,c là TRUE; b,d là FALSE
        const correctTrueSet = new Set(
          correctAnswer
            .toLowerCase()
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        );

        // Lấy danh sách letters từ options thực tế (hoặc fallback a,b,c,d)
        const allLetters =
          q.options && q.options.length > 0
            ? q.options.map((opt: { letter: string }) => opt.letter.toLowerCase())
            : ['a', 'b', 'c', 'd'];

        // ✅ Parse student answer — tự nhận dạng format mới/cũ/JSON
        const tfMap = parseTFAnswerStrict(userAnswer, allLetters);

        let correctCount = 0;
        let answeredCount = 0;

        for (const letter of allLetters) {
          const studentVal = tfMap[letter]; // 'T' | 'F' | undefined

          if (studentVal === undefined) {
            // Format mới: undefined = chưa trả lời → bỏ qua
            // Format cũ: parseTFAnswerStrict đã điền đủ → không có undefined
            continue;
          }

          answeredCount++;
          const studentSaidTrue = studentVal === 'T';
          const correctIsTrue = correctTrueSet.has(letter);

          if (studentSaidTrue === correctIsTrue) correctCount++;
        }

        // Nếu chưa trả lời bất kỳ ý nào → 0 điểm
        const points = answeredCount === 0
          ? 0
          : calculateTrueFalsePoints(correctCount, pointsPerQuestion, tfMode);

        breakdown.trueFalse.points += points;
        breakdown.trueFalse.details[q.number] = {
          correctCount,
          points,
        };

        // correct = đúng tất cả AND đã trả lời đủ; partial = đúng một phần
        if (correctCount === allLetters.length && answeredCount === allLetters.length) {
          breakdown.trueFalse.correct++;
        } else if (correctCount > 0) {
          breakdown.trueFalse.partial++;
        }
      }
    }

    // === TRẢ LỜI NGẮN ===
    else if (mappedType === 'short_answer') {
      breakdown.shortAnswer.total++;
      saCount++;
      saPoints += pointsPerQuestion;

      if (userAnswer && correctAnswer) {
        const normalizedUser = normalizeAnswer(userAnswer);
        const normalizedCorrect = normalizeAnswer(correctAnswer);

        if (normalizedUser === normalizedCorrect) {
          breakdown.shortAnswer.correct++;
          breakdown.shortAnswer.points += pointsPerQuestion;
        }
      }
    }
  });

  breakdown.multipleChoice.pointsPerQuestion = mcCount > 0 ? mcPoints / mcCount : 0;
  breakdown.trueFalse.pointsPerQuestion = tfCount > 0 ? tfPoints / tfCount : 0;
  breakdown.shortAnswer.pointsPerQuestion = saCount > 0 ? saPoints / saCount : 0;

  const total =
    breakdown.multipleChoice.points +
    breakdown.trueFalse.points +
    breakdown.shortAnswer.points;

  breakdown.totalScore = parseFloat(total.toFixed(4));

  const maxScore = config?.maxScore || 10;
  const pct = Math.round((breakdown.totalScore / maxScore) * 100);
  breakdown.percentage = Math.max(0, Math.min(100, pct));

  return breakdown;
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

export function getGrade(percentage: number): {
  grade: string;
  color: string;
  emoji: string;
  label: string;
  bg: string;
} {
  if (percentage >= 90) return { grade: 'A+', color: 'text-green-600', bg: 'bg-green-100', emoji: '🏆', label: 'Xuất sắc' };
  if (percentage >= 80) return { grade: 'A',  color: 'text-green-600', bg: 'bg-green-100', emoji: '🌟', label: 'Giỏi' };
  if (percentage >= 70) return { grade: 'B+', color: 'text-blue-600',  bg: 'bg-blue-100',  emoji: '👍', label: 'Khá' };
  if (percentage >= 60) return { grade: 'B',  color: 'text-blue-600',  bg: 'bg-blue-100',  emoji: '📚', label: 'Trung bình khá' };
  if (percentage >= 50) return { grade: 'C',  color: 'text-yellow-600',bg: 'bg-yellow-100',emoji: '💪', label: 'Trung bình' };
  if (percentage >= 40) return { grade: 'D',  color: 'text-orange-600',bg: 'bg-orange-100',emoji: '📖', label: 'Yếu' };
  return { grade: 'F', color: 'text-red-600', bg: 'bg-red-100', emoji: '😞', label: 'Kém' };
}

export function getTotalCorrectCount(breakdown: ScoreBreakdown): number {
  return breakdown.multipleChoice.correct + breakdown.trueFalse.correct + breakdown.shortAnswer.correct;
}

export function getTotalWrongCount(breakdown: ScoreBreakdown, totalQuestions: number): number {
  return totalQuestions - getTotalCorrectCount(breakdown);
}

export function validatePointsConfig(config: ExamPointsConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.maxScore <= 0) errors.push('Thang điểm phải lớn hơn 0');

  const totalPoints = config.sections.reduce((sum, s) => sum + s.totalPoints, 0);
  if (Math.abs(totalPoints - config.maxScore) > 0.01) {
    errors.push(
      `Tổng điểm các phần (${totalPoints.toFixed(2)}) phải bằng thang điểm (${config.maxScore})`
    );
  }

  config.sections.forEach((section) => {
    if (section.totalPoints < 0)
      errors.push(`Điểm phần "${section.sectionName}" không được âm`);
    if (section.totalQuestions <= 0)
      errors.push(`Số câu hỏi phần "${section.sectionName}" phải lớn hơn 0`);
  });

  return { valid: errors.length === 0, errors };
}
