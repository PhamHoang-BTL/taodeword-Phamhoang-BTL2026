// ============================================================
// KnowledgeTab.tsx
// Tab quản lý kiến thức + Tạo câu hỏi AI/thủ công + Nhận xét học sinh
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Class,
  Exam,
  Room,
  Submission,
  KnowledgeUnit,
  LearningObjective,
  Question,
  QuestionType,
  ClassAssessmentReport,
} from '../types';
import {
  createKnowledgeUnit,
  updateKnowledgeUnit,
  deleteKnowledgeUnit,
  getKnowledgeUnitsByTeacher,
  generateQuestionsWithAI,
  generateAIAssessment,
  AIGeneratedQuestion,
} from '../services/knowledgeService';
import {
  getExamsByTeacher,
  getRoomsByTeacher,
  subscribeToSubmissions,
  getExam,
} from '../services/firebaseService';

// ─── Helpers ──────────────────────────────────────────────────────────────

const SUBJECTS = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Văn học', 'Lịch sử', 'Địa lý', 'GDCD', 'Tin học', 'Khác'];
const GRADES = ['6', '7', '8', '9', '10', '11', '12'];
const DIFFICULTY_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
const Q_TYPES: { value: QuestionType; label: string; icon: string }[] = [
  { value: 'multiple_choice', label: 'Trắc nghiệm', icon: '⭕' },
  { value: 'true_false', label: 'Đúng/Sai', icon: '✅' },
  { value: 'short_answer', label: 'Trả lời ngắn', icon: '✏️' },
];

const genId = () => Math.random().toString(36).slice(2, 10);

// ─── Sub-tabs ─────────────────────────────────────────────────────────────

type SubTab = 'units' | 'generate' | 'manual' | 'assessment';

interface Props {
  teacher: User;
  classes: Class[];
  onAddQuestionsToBank?: (questions: Question[]) => void;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────

const KnowledgeTab: React.FC<Props> = ({ teacher, classes, onAddQuestionsToBank }) => {
  const [subTab, setSubTab] = useState<SubTab>('units');

  // Knowledge units
  const [units, setUnits] = useState<KnowledgeUnit[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(true);
  const [editingUnit, setEditingUnit] = useState<KnowledgeUnit | null>(null);
  const [showUnitForm, setShowUnitForm] = useState(false);

  // Exams + rooms for assessment
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // AI question generation
  const [selectedUnitForGen, setSelectedUnitForGen] = useState('');
  const [genType, setGenType] = useState<QuestionType>('multiple_choice');
  const [genCount, setGenCount] = useState(5);
  const [genDifficulty, setGenDifficulty] = useState('Thông hiểu');
  const [genInstructions, setGenInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<AIGeneratedQuestion[]>([]);

  // Manual question creation
  const [manualUnit, setManualUnit] = useState('');
  const [manualType, setManualType] = useState<QuestionType>('multiple_choice');
  const [manualText, setManualText] = useState('');
  const [manualOptions, setManualOptions] = useState([
    { letter: 'A', text: '', isCorrect: false },
    { letter: 'B', text: '', isCorrect: false },
    { letter: 'C', text: '', isCorrect: false },
    { letter: 'D', text: '', isCorrect: false },
  ]);
  const [manualTF, setManualTF] = useState({ a: '', b: '', c: '', d: '' });
  const [manualTFAnswers, setManualTFAnswers] = useState({ a: false, b: false, c: false, d: false });
  const [manualShortAnswer, setManualShortAnswer] = useState('');
  const [manualSolution, setManualSolution] = useState('');

  // Assessment
  const [assessUnit, setAssessUnit] = useState('');
  const [assessExam, setAssessExam] = useState('');
  const [assessRoom, setAssessRoom] = useState('');
  const [assessSubmissions, setAssessSubmissions] = useState<Submission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessReport, setAssessReport] = useState<ClassAssessmentReport | null>(null);
  const [passingScore, setPassingScore] = useState(50);

  // Load data
  useEffect(() => {
    loadUnits();
    loadExamsAndRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUnits = async () => {
    setIsLoadingUnits(true);
    try {
      const list = await getKnowledgeUnitsByTeacher(teacher.id);
      list.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
      setUnits(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingUnits(false);
    }
  };

  const loadExamsAndRooms = async () => {
    try {
      const [e, r] = await Promise.all([
        getExamsByTeacher(teacher.id),
        getRoomsByTeacher(teacher.id),
      ]);
      setExams(e);
      setRooms(r.filter((rm) => rm.submittedCount > 0));
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Load submissions when room selected ─────────────────────────────────

  useEffect(() => {
    if (!assessRoom) { setAssessSubmissions([]); return; }
    setIsLoadingSubmissions(true);
    const unsub = subscribeToSubmissions(assessRoom, (subs) => {
      setAssessSubmissions(subs.filter((s) => s.status === 'submitted'));
      setIsLoadingSubmissions(false);
    });
    return () => unsub();
  }, [assessRoom]);

  // ─── Unit Form ────────────────────────────────────────────────────────────

  const UnitForm: React.FC<{ initial?: KnowledgeUnit; onSave: (u: KnowledgeUnit) => void; onCancel: () => void }> = ({
    initial,
    onSave,
    onCancel,
  }) => {
    const [title, setTitle] = useState(initial?.title || '');
    const [subject, setSubject] = useState(initial?.subject || 'Toán');
    const [grade, setGrade] = useState(initial?.grade || '10');
    const [content, setContent] = useState(initial?.content || '');
    const [objectives, setObjectives] = useState<LearningObjective[]>(
      initial?.objectives || [{ id: genId(), description: '', level: 'Nhận biết' }]
    );
    const [isSaving, setIsSaving] = useState(false);

    const addObjective = () =>
      setObjectives((prev) => [...prev, { id: genId(), description: '', level: 'Thông hiểu' }]);
    const removeObjective = (id: string) =>
      setObjectives((prev) => prev.filter((o) => o.id !== id));
    const updateObjective = (id: string, field: keyof LearningObjective, value: string) =>
      setObjectives((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));

    const handleSave = async () => {
      if (!title.trim()) { alert('Vui lòng nhập tên chủ đề.'); return; }
      if (!content.trim()) { alert('Vui lòng nhập nội dung kiến thức.'); return; }
      if (objectives.some((o) => !o.description.trim())) {
        alert('Vui lòng điền đầy đủ mục tiêu học tập.'); return;
      }

      setIsSaving(true);
      try {
        if (initial) {
          await updateKnowledgeUnit(initial.id, { title, subject, grade, content, objectives });
          onSave({ ...initial, title, subject, grade, content, objectives });
        } else {
          const created = await createKnowledgeUnit({
            title,
            subject,
            grade,
            content,
            objectives,
            teacherId: teacher.id,
          });
          onSave(created);
        }
      } catch (err: any) {
        alert('❌ ' + err.message);
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
        <h3 className="text-lg font-bold text-gray-900">
          {initial ? '✏️ Chỉnh sửa chủ đề kiến thức' : '➕ Thêm chủ đề kiến thức mới'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Môn học</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none text-sm">
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Khối lớp</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none text-sm">
              {GRADES.map((g) => <option key={g}>Lớp {g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Tên chủ đề <span className="text-red-500">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Hàm số bậc hai"
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Nội dung kiến thức <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal ml-1">(AI sẽ dùng nội dung này để tạo câu hỏi)</span>
          </label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)}
            rows={6} placeholder="Mô tả chi tiết nội dung kiến thức, công thức, định lý, ví dụ minh họa..."
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:outline-none text-sm resize-none" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">Mục tiêu học tập</label>
            <button onClick={addObjective} className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1 rounded-lg font-medium transition">
              + Thêm mục tiêu
            </button>
          </div>
          <div className="space-y-2">
            {objectives.map((obj) => (
              <div key={obj.id} className="flex gap-2 items-center">
                <select value={obj.level}
                  onChange={(e) => updateObjective(obj.id, 'level', e.target.value as any)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-teal-400 shrink-0">
                  {DIFFICULTY_LEVELS.map((l) => <option key={l}>{l}</option>)}
                </select>
                <input value={obj.description}
                  onChange={(e) => updateObjective(obj.id, 'description', e.target.value)}
                  placeholder="Mô tả mục tiêu học tập..."
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-teal-400" />
                {objectives.length > 1 && (
                  <button onClick={() => removeObjective(obj.id)} className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0">×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition text-sm">
            Hủy
          </button>
          <button onClick={handleSave} disabled={isSaving}
            className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition disabled:opacity-50 text-sm">
            {isSaving ? 'Đang lưu...' : initial ? '💾 Cập nhật' : '➕ Tạo chủ đề'}
          </button>
        </div>
      </div>
    );
  };

  // ─── AI Generate Tab ──────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const unit = units.find((u) => u.id === selectedUnitForGen);
    if (!unit) { alert('Vui lòng chọn chủ đề kiến thức.'); return; }
    setIsGenerating(true);
    setGeneratedQuestions([]);
    try {
      const qs = await generateQuestionsWithAI({
        knowledgeUnit: unit,
        questionType: genType,
        count: genCount,
        difficulty: genDifficulty,
        additionalInstructions: genInstructions,
      });
      setGeneratedQuestions(qs);
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const aiQuestionToQuestion = (aq: AIGeneratedQuestion, idx: number): Question => {
    const number = Date.now() + idx;
    if (aq.type === 'true_false' && aq.tfStatements) {
      const statements = aq.tfStatements as any;
      const answers = aq.tfAnswers as any || {};
      const correctKeys = Object.keys(answers).filter((k) => answers[k]);
      return {
        number,
        text: aq.text,
        type: 'true_false',
        options: [],
        correctAnswer: correctKeys.join(','),
        solution: aq.solution,
        tfStatements: statements,
        knowledgeUnitId: selectedUnitForGen,
      };
    }
    if (aq.type === 'short_answer') {
      return {
        number,
        text: aq.text,
        type: 'short_answer',
        options: [],
        correctAnswer: aq.correctAnswer,
        solution: aq.solution,
        knowledgeUnitId: selectedUnitForGen,
      };
    }
    // multiple_choice
    const options = (aq.options || []).map((o) => ({
      letter: o.letter,
      text: o.text,
      isCorrect: o.isCorrect,
    }));
    return {
      number,
      text: aq.text,
      type: 'multiple_choice',
      options,
      correctAnswer: aq.correctAnswer,
      solution: aq.solution,
      knowledgeUnitId: selectedUnitForGen,
    };
  };

  const handleSendToBank = () => {
    if (!onAddQuestionsToBank || generatedQuestions.length === 0) return;
    const qs = generatedQuestions.map((aq, i) => aiQuestionToQuestion(aq, i));
    onAddQuestionsToBank(qs);
    alert(`✅ Đã gửi ${qs.length} câu hỏi vào ngân hàng câu hỏi!`);
    setGeneratedQuestions([]);
  };

  // ─── Manual Question ──────────────────────────────────────────────────────

  const handleSaveManual = () => {
    if (!manualText.trim()) { alert('Vui lòng nhập nội dung câu hỏi.'); return; }

    let question: Question;

    if (manualType === 'multiple_choice') {
      const correctOption = manualOptions.find((o) => o.isCorrect);
      if (!correctOption) { alert('Vui lòng chọn đáp án đúng.'); return; }
      if (manualOptions.some((o) => !o.text.trim())) { alert('Vui lòng điền đầy đủ các lựa chọn.'); return; }
      question = {
        number: Date.now(),
        text: manualText,
        type: 'multiple_choice',
        options: manualOptions,
        correctAnswer: correctOption.letter,
        solution: manualSolution || undefined,
        knowledgeUnitId: manualUnit || undefined,
      };
    } else if (manualType === 'true_false') {
      if (Object.values(manualTF).some((v) => !v.trim())) { alert('Vui lòng điền đầy đủ 4 mệnh đề.'); return; }
      const correctKeys = (Object.keys(manualTFAnswers) as (keyof typeof manualTFAnswers)[])
        .filter((k) => manualTFAnswers[k]);
      question = {
        number: Date.now(),
        text: manualText,
        type: 'true_false',
        options: [],
        correctAnswer: correctKeys.join(','),
        solution: manualSolution || undefined,
        tfStatements: manualTF,
        knowledgeUnitId: manualUnit || undefined,
      };
    } else {
      if (!manualShortAnswer.trim()) { alert('Vui lòng nhập đáp án.'); return; }
      question = {
        number: Date.now(),
        text: manualText,
        type: 'short_answer',
        options: [],
        correctAnswer: manualShortAnswer,
        solution: manualSolution || undefined,
        knowledgeUnitId: manualUnit || undefined,
      };
    }

    if (onAddQuestionsToBank) {
      onAddQuestionsToBank([question]);
      alert('✅ Đã thêm câu hỏi vào ngân hàng!');
      setManualText('');
      setManualSolution('');
      setManualShortAnswer('');
      setManualOptions([
        { letter: 'A', text: '', isCorrect: false },
        { letter: 'B', text: '', isCorrect: false },
        { letter: 'C', text: '', isCorrect: false },
        { letter: 'D', text: '', isCorrect: false },
      ]);
      setManualTF({ a: '', b: '', c: '', d: '' });
      setManualTFAnswers({ a: false, b: false, c: false, d: false });
    }
  };

  // ─── Assessment ───────────────────────────────────────────────────────────

  const handleAssess = async () => {
    const unit = units.find((u) => u.id === assessUnit);
    if (!unit) { alert('Vui lòng chọn chủ đề kiến thức.'); return; }
    if (!assessRoom) { alert('Vui lòng chọn phòng thi.'); return; }
    if (assessSubmissions.length === 0) { alert('Chưa có bài nộp nào trong phòng này.'); return; }

    const room = rooms.find((r) => r.id === assessRoom);
    if (!room) return;
    const exam = await getExam(room.examId);
    if (!exam) { alert('Không tải được đề thi.'); return; }

    setIsAssessing(true);
    setAssessReport(null);
    try {
      const report = await generateAIAssessment({
        knowledgeUnit: unit,
        exam,
        submissions: assessSubmissions,
        passingScore,
      });
      setAssessReport(report);
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setIsAssessing(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">🧠 Kiến thức & Câu hỏi</h2>
          <p className="text-sm text-gray-500 mt-0.5">Quản lý kiến thức, tạo câu hỏi AI, nhận xét học sinh</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
        {([
          { key: 'units', label: '📚 Chủ đề kiến thức' },
          { key: 'generate', label: '🤖 AI tạo câu hỏi' },
          { key: 'manual', label: '✍️ Thêm thủ công' },
          { key: 'assessment', label: '📊 Nhận xét học sinh' },
        ] as { key: SubTab; label: string }[]).map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition min-w-[120px] ${
              subTab === t.key ? 'bg-white text-indigo-700 shadow' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SUB-TAB: Knowledge Units ─────────────────────────────── */}
      {subTab === 'units' && (
        <div className="space-y-4">
          {!showUnitForm && (
            <button onClick={() => { setEditingUnit(null); setShowUnitForm(true); }}
              className="w-full py-3 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition text-sm">
              ➕ Thêm chủ đề kiến thức mới
            </button>
          )}

          {showUnitForm && (
            <UnitForm
              initial={editingUnit || undefined}
              onSave={(u) => {
                setUnits((prev) =>
                  editingUnit
                    ? prev.map((x) => (x.id === u.id ? u : x))
                    : [u, ...prev]
                );
                setShowUnitForm(false);
                setEditingUnit(null);
              }}
              onCancel={() => { setShowUnitForm(false); setEditingUnit(null); }}
            />
          )}

          {isLoadingUnits ? (
            <div className="text-center py-10 text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
              Đang tải...
            </div>
          ) : units.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <div className="text-5xl mb-3">🧠</div>
              <p className="font-medium">Chưa có chủ đề kiến thức nào</p>
              <p className="text-sm mt-1">Thêm chủ đề đầu tiên để AI tạo câu hỏi và nhận xét học sinh</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {units.map((unit) => (
                <div key={unit.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-bold text-gray-800">{unit.title}</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{unit.subject}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Lớp {unit.grade}</span>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">{unit.content}</p>
                      {unit.objectives.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {unit.objectives.map((obj) => (
                            <span key={obj.id} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                              {obj.level}: {obj.description.length > 40 ? obj.description.slice(0, 40) + '...' : obj.description}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setEditingUnit(unit); setShowUnitForm(true); }}
                        className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium transition">
                        ✏️ Sửa
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Xóa chủ đề "${unit.title}"?`)) return;
                        await deleteKnowledgeUnit(unit.id);
                        setUnits((prev) => prev.filter((u) => u.id !== unit.id));
                      }} className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-medium transition">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SUB-TAB: AI Generate ─────────────────────────────────── */}
      {subTab === 'generate' && (
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-sm text-indigo-800 font-medium">🤖 AI sẽ tạo câu hỏi dựa trên nội dung kiến thức bạn đã nhập.</p>
            <p className="text-xs text-indigo-600 mt-1">Câu hỏi được tạo tự động và có thể chỉnh sửa trước khi thêm vào ngân hàng.</p>
          </div>

          {units.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-4xl mb-3">📚</div>
              <p>Chưa có chủ đề kiến thức. Vui lòng thêm chủ đề trước!</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Chủ đề kiến thức <span className="text-red-500">*</span></label>
                  <select value={selectedUnitForGen} onChange={(e) => setSelectedUnitForGen(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none text-sm">
                    <option value="">— Chọn chủ đề —</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.title} ({u.subject} · Lớp {u.grade})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Loại câu hỏi</label>
                  <div className="flex gap-2">
                    {Q_TYPES.map((t) => (
                      <button key={t.value} onClick={() => setGenType(t.value)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition ${
                          genType === t.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Số câu hỏi</label>
                  <input type="number" min={1} max={20} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Mức độ</label>
                  <select value={genDifficulty} onChange={(e) => setGenDifficulty(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none text-sm">
                    {DIFFICULTY_LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Yêu cầu thêm <span className="text-gray-400 font-normal">(không bắt buộc)</span></label>
                  <input value={genInstructions} onChange={(e) => setGenInstructions(e.target.value)}
                    placeholder="VD: Tập trung vào dạng bài tính diện tích, tránh lý thuyết thuần túy..."
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none text-sm" />
                </div>
              </div>

              <button onClick={handleGenerate} disabled={isGenerating || !selectedUnitForGen}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    AI đang tạo câu hỏi...
                  </>
                ) : `🤖 Tạo ${genCount} câu hỏi ${Q_TYPES.find((t) => t.value === genType)?.label}`}
              </button>

              {/* Generated Questions Preview */}
              {generatedQuestions.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800">
                      ✅ AI tạo được <span className="text-indigo-600">{generatedQuestions.length}</span> câu hỏi
                    </p>
                    <button onClick={handleSendToBank}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition">
                      📚 Thêm vào ngân hàng
                    </button>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {generatedQuestions.map((q, idx) => (
                      <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Câu {idx + 1}</span>
                          <span className="text-xs text-gray-500">{Q_TYPES.find((t) => t.value === q.type)?.label}</span>
                        </div>
                        <p className="text-sm text-gray-800 font-medium mb-2">{q.text}</p>

                        {q.type === 'multiple_choice' && q.options && (
                          <div className="space-y-1">
                            {q.options.map((opt, oi) => (
                              <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg ${opt.isCorrect ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-600'}`}>
                                {opt.letter}. {opt.text}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'true_false' && q.tfStatements && (
                          <div className="space-y-1">
                            {Object.entries(q.tfStatements as any).map(([k, v]: any) => {
                              const isTrue = (q.tfAnswers as any)?.[k];
                              return (
                                <div key={k} className={`text-xs px-3 py-1.5 rounded-lg ${isTrue ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                  <span className="font-bold">{k.toUpperCase()}.</span> {v} — {isTrue ? '✓ Đúng' : '✗ Sai'}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.type === 'short_answer' && (
                          <p className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
                            Đáp án: {q.correctAnswer}
                          </p>
                        )}

                        {q.solution && (
                          <p className="text-xs text-gray-500 mt-2 italic">💡 {q.solution}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SUB-TAB: Manual ──────────────────────────────────────── */}
      {subTab === 'manual' && (
        <div className="space-y-5 max-w-2xl">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800 font-medium">✍️ Tự tay nhập câu hỏi vào ngân hàng</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Chủ đề kiến thức</label>
              <select value={manualUnit} onChange={(e) => setManualUnit(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm">
                <option value="">— Không chọn —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Loại câu hỏi</label>
              <div className="flex gap-1">
                {Q_TYPES.map((t) => (
                  <button key={t.value} onClick={() => setManualType(t.value)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition ${
                      manualType === t.value ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    {t.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nội dung câu hỏi <span className="text-red-500">*</span></label>
            <textarea value={manualText} onChange={(e) => setManualText(e.target.value)}
              rows={3} placeholder="Nhập nội dung câu hỏi..."
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm resize-none" />
          </div>

          {/* Multiple choice options */}
          {manualType === 'multiple_choice' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Các lựa chọn <span className="text-gray-400 font-normal">(click radio để chọn đáp án đúng)</span></label>
              <div className="space-y-2">
                {manualOptions.map((opt, i) => (
                  <div key={opt.letter} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={opt.isCorrect}
                      onChange={() => setManualOptions((prev) => prev.map((o, j) => ({ ...o, isCorrect: j === i })))}
                      className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded text-xs font-bold shrink-0">{opt.letter}</span>
                    <input value={opt.text}
                      onChange={(e) => setManualOptions((prev) => prev.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                      placeholder={`Lựa chọn ${opt.letter}`}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* True/False statements */}
          {manualType === 'true_false' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">4 mệnh đề Đúng/Sai</label>
              <div className="space-y-2">
                {(['a', 'b', 'c', 'd'] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded text-xs font-bold shrink-0 uppercase">{k}</span>
                    <input value={manualTF[k]}
                      onChange={(e) => setManualTF((prev) => ({ ...prev, [k]: e.target.value }))}
                      placeholder={`Mệnh đề ${k.toUpperCase()}...`}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400" />
                    <label className="flex items-center gap-1 text-sm shrink-0 cursor-pointer">
                      <input type="checkbox" checked={manualTFAnswers[k]}
                        onChange={(e) => setManualTFAnswers((prev) => ({ ...prev, [k]: e.target.checked }))}
                        className="w-4 h-4" />
                      Đúng
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Short answer */}
          {manualType === 'short_answer' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Đáp án đúng <span className="text-red-500">*</span></label>
              <input value={manualShortAnswer} onChange={(e) => setManualShortAnswer(e.target.value)}
                placeholder="Nhập đáp án..."
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm" />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Lời giải <span className="text-gray-400 font-normal">(không bắt buộc)</span></label>
            <textarea value={manualSolution} onChange={(e) => setManualSolution(e.target.value)}
              rows={2} placeholder="Giải thích cách làm..."
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm resize-none" />
          </div>

          <button onClick={handleSaveManual}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition">
            ➕ Thêm vào ngân hàng câu hỏi
          </button>
        </div>
      )}

      {/* ── SUB-TAB: Assessment ──────────────────────────────────── */}
      {subTab === 'assessment' && (
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-800 font-medium">📊 AI phân tích kết quả bài thi và đối chiếu với kiến thức để nhận xét học sinh</p>
          </div>

          {units.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p>Chưa có chủ đề kiến thức. Hãy thêm chủ đề trước!</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Chủ đề kiến thức <span className="text-red-500">*</span></label>
                  <select value={assessUnit} onChange={(e) => setAssessUnit(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm">
                    <option value="">— Chọn chủ đề —</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phòng thi <span className="text-red-500">*</span></label>
                  <select value={assessRoom} onChange={(e) => setAssessRoom(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm">
                    <option value="">— Chọn phòng có bài nộp —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.examTitle} · {r.code} ({r.submittedCount} bài nộp)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ngưỡng điểm đạt (%)</label>
                  <input type="number" min={1} max={100} value={passingScore}
                    onChange={(e) => setPassingScore(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm" />
                </div>

                {assessRoom && (
                  <div className="flex items-end">
                    <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${
                      isLoadingSubmissions ? 'bg-gray-100 text-gray-500' :
                      assessSubmissions.length > 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                    }`}>
                      {isLoadingSubmissions ? '⏳ Đang tải...' :
                        assessSubmissions.length > 0
                          ? `✅ ${assessSubmissions.length} bài nộp sẵn sàng`
                          : '⚠️ Chưa có bài nộp'
                      }
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleAssess}
                disabled={isAssessing || !assessUnit || !assessRoom || assessSubmissions.length === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                {isAssessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    AI đang phân tích...
                  </>
                ) : '📊 Tạo báo cáo nhận xét học sinh'}
              </button>

              {/* Assessment Report */}
              {assessReport && (
                <div className="space-y-5">
                  {/* Overview */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      Báo cáo: {assessReport.knowledgeUnitTitle}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">Đề thi: {assessReport.examTitle}</p>

                    <div className="grid grid-cols-3 gap-4 mb-5">
                      <div className="text-center p-4 bg-blue-50 rounded-xl">
                        <p className="text-2xl font-bold text-blue-700">{assessReport.classAverage.toFixed(1)}%</p>
                        <p className="text-xs text-blue-600 mt-1">Điểm TB lớp</p>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-xl">
                        <p className="text-2xl font-bold text-green-700">{assessReport.passRate.toFixed(0)}%</p>
                        <p className="text-xs text-green-600 mt-1">Tỉ lệ đạt</p>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-xl">
                        <p className="text-2xl font-bold text-purple-700">{assessReport.studentResults.length}</p>
                        <p className="text-xs text-purple-600 mt-1">Học sinh</p>
                      </div>
                    </div>

                    {assessReport.aiSummary && (
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-sm font-semibold text-indigo-800 mb-1">🤖 Nhận xét tổng quan</p>
                        <p className="text-sm text-indigo-700">{assessReport.aiSummary}</p>
                      </div>
                    )}

                    {assessReport.commonWeakObjectives.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">⚠️ Kiến thức cả lớp còn yếu:</p>
                        <div className="flex flex-wrap gap-2">
                          {assessReport.commonWeakObjectives.map((obj, i) => (
                            <span key={i} className="text-xs bg-red-50 text-red-700 border border-red-100 px-3 py-1 rounded-full">{obj}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-student results */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                      <h4 className="font-bold text-gray-800">Kết quả từng học sinh</h4>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {assessReport.studentResults.map((sr, idx) => (
                        <div key={idx} className="px-6 py-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                sr.overallVerdict === 'Đạt' ? 'bg-green-500' : 'bg-red-400'
                              }`}>
                                {sr.overallVerdict === 'Đạt' ? '✓' : '✗'}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 text-sm">{sr.studentName}</p>
                                <p className="text-xs text-gray-500">{sr.percentage.toFixed(1)}% · {sr.overallVerdict}</p>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              sr.overallVerdict === 'Đạt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {sr.overallVerdict}
                            </span>
                          </div>

                          {sr.masteredObjectives.length > 0 && (
                            <div className="mb-1">
                              <span className="text-xs text-green-600 font-medium">✅ Đạt: </span>
                              <span className="text-xs text-gray-600">{sr.masteredObjectives.join(', ')}</span>
                            </div>
                          )}
                          {sr.weakObjectives.length > 0 && (
                            <div className="mb-1">
                              <span className="text-xs text-red-600 font-medium">❌ Chưa đạt: </span>
                              <span className="text-xs text-gray-600">{sr.weakObjectives.join(', ')}</span>
                            </div>
                          )}
                          {sr.advice && (
                            <p className="text-xs text-indigo-600 italic mt-1">💡 {sr.advice}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default KnowledgeTab;
