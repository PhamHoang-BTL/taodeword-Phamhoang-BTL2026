// services/mergeExamsService.ts
import { ExamData, ExamPointsConfig, Question, QuestionOption } from '../types';

// ─── Shuffle helper ────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Xáo trộn phương án trắc nghiệm (A/B/C/D), cập nhật correctAnswer ────
function shuffleMCOptions(question: Question): Question {
  if (!question.options || question.options.length === 0) return question;

  const LETTERS = ['A', 'B', 'C', 'D'];
  const correctUpper = (question.correctAnswer ?? '').toUpperCase();

  // Lưu text của đáp án đúng trước khi xáo
  const correctText = question.options.find(
    (o) => o.letter.toUpperCase() === correctUpper
  )?.text;

  const shuffledOpts: QuestionOption[] = shuffle(question.options).map((opt, i) => ({
    ...opt,
    letter: LETTERS[i] ?? opt.letter,
    isCorrect: false, // sẽ cập nhật bên dưới
  }));

  // Tìm vị trí mới của đáp án đúng
  let newCorrectAnswer = question.correctAnswer;
  if (correctText !== undefined) {
    const newIdx = shuffledOpts.findIndex((o) => o.text === correctText);
    if (newIdx >= 0) {
      newCorrectAnswer = LETTERS[newIdx];
      shuffledOpts[newIdx] = { ...shuffledOpts[newIdx], isCorrect: true };
    }
  }

  return { ...question, options: shuffledOpts, correctAnswer: newCorrectAnswer };
}

// ─── Xáo trộn mệnh đề Đúng/Sai (a, b, c); d giữ nguyên ──────────────────
// Định dạng correctAnswer: "a,c" → các mệnh đề có đáp án ĐÚNG
function shuffleTFStatements(question: Question): Question {
  if (!question.tfStatements) return question;

  const stmts = question.tfStatements;
  const correctLetters = new Set(
    (question.correctAnswer ?? '')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  // Chỉ xáo trộn a, b, c — d cố định
  const movableKeys = (['a', 'b', 'c'] as const).filter((k) => stmts[k] !== undefined);

  // Tạo mảng {text, isCorrect} rồi shuffle
  const pairs = movableKeys.map((k) => ({
    text: stmts[k],
    isCorrect: correctLetters.has(k),
  }));
  const shuffledPairs = shuffle(pairs);

  // Gán lại tfStatements
  const newStmts = { ...stmts };
  movableKeys.forEach((k, i) => {
    newStmts[k] = shuffledPairs[i].text;
  });

  // Xây dựng correctAnswer mới
  const newCorrect: string[] = [];
  movableKeys.forEach((k, i) => {
    if (shuffledPairs[i].isCorrect) newCorrect.push(k);
  });
  if (stmts['d'] !== undefined && correctLetters.has('d')) newCorrect.push('d');

  return {
    ...question,
    tfStatements: newStmts,
    correctAnswer: newCorrect.join(',') || '',
  };
}

// ─── Apply shuffle tùy loại câu hỏi ──────────────────────────────────────
function applyOptionShuffle(question: Question): Question {
  if (question.type === 'multiple_choice') return shuffleMCOptions(question);
  if (question.type === 'true_false')      return shuffleTFStatements(question);
  return question;
}

// ─── Public types ─────────────────────────────────────────────────────────

export interface ExamSource {
  filename: string;
  data: ExamData;
}

export interface MergeConfig {
  targetMC?: number;
  targetTF?: number;
  targetSA?: number;
  timeLimit?: number;
  /** Xáo trộn thứ tự phương án khi trộn đề. Mặc định: true */
  shuffleOptions?: boolean;
}

export interface MergeStats {
  format: { mc: number; tf: number; sa: number };
  poolSize: { mc: number; tf: number; sa: number };
  selected: { mc: number; tf: number; sa: number };
  sourceFiles: string[];
  warnings: string[];
}

export interface MergeResult {
  mergedExam: ExamData;
  stats: MergeStats;
  /** Config điểm sẵn sàng để đưa vào PointsConfigEditor */
  pointsConfig: ExamPointsConfig;
}

// ─── Variant (mã đề) ──────────────────────────────────────────────────────
export interface VariantResult {
  variantNumber: number;
  /** VD: "001", "002" */
  variantCode: string;
  mergeResult: MergeResult;
  /** Tiêu đề đã gắn mã đề */
  title: string;
}

// ─── Build ExamPointsConfig đúng theo loại câu hỏi ───────────────────────
export const buildPointsConfigFromQuestions = (
  questions: Question[],
  maxScore = 10
): ExamPointsConfig => {
  const SECTION_INFO: Record<
    string,
    { id: string; name: string; order: number }
  > = {
    multiple_choice: {
      id: 'mc',
      name: 'Phần 1. Trắc nghiệm nhiều lựa chọn',
      order: 1,
    },
    true_false: {
      id: 'tf',
      name: 'Phần 2. Đúng / Sai',
      order: 2,
    },
    short_answer: {
      id: 'sa',
      name: 'Phần 3. Trả lời ngắn',
      order: 3,
    },
  };

  const countByType: Record<string, number> = {};
  for (const q of questions) {
    countByType[q.type] = (countByType[q.type] ?? 0) + 1;
  }

  const totalQ = questions.length;
  const types = Object.keys(countByType).sort(
    (a, b) => (SECTION_INFO[a]?.order ?? 9) - (SECTION_INFO[b]?.order ?? 9)
  );

  let remaining = maxScore;
  const sections = types.map((type, idx) => {
    const info = SECTION_INFO[type] ?? {
      id: type,
      name: `Phần ${idx + 1}. ${type}`,
      order: idx + 1,
    };
    const count = countByType[type];
    const isLast = idx === types.length - 1;

    const totalPoints = isLast
      ? parseFloat(remaining.toFixed(2))
      : parseFloat(((count / totalQ) * maxScore).toFixed(2));

    remaining -= totalPoints;

    return {
      sectionId: info.id,
      sectionName: info.name,
      questionType: type as 'multiple_choice' | 'true_false' | 'short_answer',
      totalQuestions: count,
      totalPoints,
      pointsPerQuestion: parseFloat((totalPoints / count).toFixed(4)),
      ...(type === 'true_false' ? { trueFalseMode: 'stepped' as const } : {}),
    };
  });

  return {
    maxScore,
    sections,
    autoBalance: false,
  };
};

export const detectFormat = (
  sources: ExamSource[]
): { mc: number; tf: number; sa: number; warnings: string[] } => {
  const warnings: string[] = [];
  const counts = sources.map((s) => ({
    mc: s.data.questions.filter((q) => q.type === 'multiple_choice').length,
    tf: s.data.questions.filter((q) => q.type === 'true_false').length,
    sa: s.data.questions.filter((q) => q.type === 'short_answer').length,
  }));

  const allSame = counts.every(
    (c) => c.mc === counts[0].mc && c.tf === counts[0].tf && c.sa === counts[0].sa
  );

  if (!allSame) {
    warnings.push(
      `Các đề có số câu không giống nhau. Dùng format của "${sources[0].filename}" làm chuẩn.`
    );
    counts.forEach((c, i) => {
      warnings.push(`  ${sources[i].filename}: TN=${c.mc}, Đ/S=${c.tf}, TLN=${c.sa}`);
    });
  }

  return { ...counts[0], warnings };
};

export const mergeExams = (sources: ExamSource[], config: MergeConfig = {}): MergeResult => {
  if (sources.length < 2) throw new Error('Cần ít nhất 2 đề để trộn');

  const { warnings, mc: fmtMC, tf: fmtTF, sa: fmtSA } = detectFormat(sources);

  const targetMC = config.targetMC ?? fmtMC;
  const targetTF = config.targetTF ?? fmtTF;
  const targetSA = config.targetSA ?? fmtSA;
  const doShuffle = config.shuffleOptions !== false; // mặc định true

  const poolMC = sources.flatMap((s) =>
    s.data.questions.filter((q) => q.type === 'multiple_choice')
  );
  const poolTF = sources.flatMap((s) =>
    s.data.questions.filter((q) => q.type === 'true_false')
  );
  const poolSA = sources.flatMap((s) =>
    s.data.questions.filter((q) => q.type === 'short_answer')
  );

  if (poolMC.length < targetMC) warnings.push(`Pool TN chỉ có ${poolMC.length} câu, cần ${targetMC}`);
  if (poolTF.length < targetTF) warnings.push(`Pool Đ/S chỉ có ${poolTF.length} câu, cần ${targetTF}`);
  if (poolSA.length < targetSA) warnings.push(`Pool TLN chỉ có ${poolSA.length} câu, cần ${targetSA}`);

  const selectedMC = shuffle(poolMC).slice(0, targetMC);
  const selectedTF = shuffle(poolTF).slice(0, targetTF);
  const selectedSA = shuffle(poolSA).slice(0, targetSA);

  const allSelected: Question[] = [...selectedMC, ...selectedTF, ...selectedSA];

  // ✅ Đánh số lại + xáo trộn phương án (nếu bật)
  const renumbered: Question[] = allSelected.map((q, i) => {
    const numbered = { ...q, number: i + 1 };
    return doShuffle ? applyOptionShuffle(numbered) : numbered;
  });

  // Xây dựng answers map từ correctAnswer đã được cập nhật sau shuffle
  const answers: Record<number, string> = {};
  for (const q of renumbered) {
    const ans = q.correctAnswer;
    if (ans != null && ans !== '') answers[q.number] = String(ans);
  }

  const seenImgIds = new Set<string>();
  const mergedImages = sources
    .flatMap((s) => s.data.images ?? [])
    .filter((img) => {
      if (!img.id) return true;
      if (seenImgIds.has(img.id)) return false;
      seenImgIds.add(img.id);
      return true;
    });

  const builtSections: ExamData['sections'] = [];
  if (selectedMC.length > 0) {
    builtSections.push({
      id: 'mc',
      name: 'Phần 1. Trắc nghiệm nhiều lựa chọn',
      questionType: 'multiple_choice',
      startNumber: 1,
      endNumber: selectedMC.length,
    } as any);
  }
  if (selectedTF.length > 0) {
    const start = selectedMC.length + 1;
    builtSections.push({
      id: 'tf',
      name: 'Phần 2. Đúng / Sai',
      questionType: 'true_false',
      startNumber: start,
      endNumber: start + selectedTF.length - 1,
    } as any);
  }
  if (selectedSA.length > 0) {
    const start = selectedMC.length + selectedTF.length + 1;
    builtSections.push({
      id: 'sa',
      name: 'Phần 3. Trả lời ngắn',
      questionType: 'short_answer',
      startNumber: start,
      endNumber: start + selectedSA.length - 1,
    } as any);
  }

  const mergedExam: ExamData = {
    title: sources.map((s) => s.filename).join(' + '),
    questions: renumbered,
    sections: builtSections,
    answers,
    images: mergedImages,
    timeLimit: config.timeLimit ?? sources[0].data.timeLimit ?? 90,
  };

  const pointsConfig = buildPointsConfigFromQuestions(renumbered);

  return {
    mergedExam,
    stats: {
      format: { mc: targetMC, tf: targetTF, sa: targetSA },
      poolSize: { mc: poolMC.length, tf: poolTF.length, sa: poolSA.length },
      selected: { mc: selectedMC.length, tf: selectedTF.length, sa: selectedSA.length },
      sourceFiles: sources.map((s) => s.filename),
      warnings,
    },
    pointsConfig,
  };
};

// ─── Tạo nhiều mã đề từ cùng một pool câu hỏi ────────────────────────────
export const generateVariants = (
  sources: ExamSource[],
  config: MergeConfig,
  numVariants: number,
  baseTitle: string
): VariantResult[] => {
  if (numVariants < 1) throw new Error('Số mã đề phải >= 1');
  if (sources.length < 2) throw new Error('Cần ít nhất 2 đề nguồn để tạo mã đề');

  const variants: VariantResult[] = [];

  for (let i = 0; i < numVariants; i++) {
    const variantCode = String(i + 1).padStart(3, '0');
    const title = `${baseTitle} - Mã đề ${variantCode}`;

    const result = mergeExams(sources, config);
    result.mergedExam.title = title;

    variants.push({
      variantNumber: i + 1,
      variantCode,
      mergeResult: result,
      title,
    });
  }

  return variants;
};

// ─── Ước tính số mã đề tối đa ─────────────────────────────────────────────
export const estimateMaxVariants = (
  sources: ExamSource[],
  config: MergeConfig = {}
): { maxRecommended: number; poolSize: { mc: number; tf: number; sa: number } } => {
  const poolMC = sources.flatMap((s) => s.data.questions.filter((q) => q.type === 'multiple_choice')).length;
  const poolTF = sources.flatMap((s) => s.data.questions.filter((q) => q.type === 'true_false')).length;
  const poolSA = sources.flatMap((s) => s.data.questions.filter((q) => q.type === 'short_answer')).length;

  const { mc: fmtMC, tf: fmtTF, sa: fmtSA } = detectFormat(sources);
  const targetMC = config.targetMC ?? fmtMC;
  const targetTF = config.targetTF ?? fmtTF;
  const targetSA = config.targetSA ?? fmtSA;

  const ratioMC = targetMC > 0 ? poolMC / targetMC : 999;
  const ratioTF = targetTF > 0 ? poolTF / targetTF : 999;
  const ratioSA = targetSA > 0 ? poolSA / targetSA : 999;

  const minRatio = Math.min(ratioMC, ratioTF, ratioSA);
  const maxRecommended = Math.min(9, Math.max(1, Math.floor(minRatio)));

  return {
    maxRecommended,
    poolSize: { mc: poolMC, tf: poolTF, sa: poolSA },
  };
};
