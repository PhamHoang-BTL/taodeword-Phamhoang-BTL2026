// components/QuestionBankTab.tsx
/**
 * QuestionBankTab — ENHANCED
 * ──────────────────────────────────────────────────────────────────
 * ✅ Tính năng mới:
 *   1. Lọc nhiều chủ đề cùng lúc (multi-topic checkboxes)
 *   2. Tạo đề theo cấu trúc: chọn số câu MC/TF/SA + mức độ từng loại
 *   3. Xem trước đề (full preview với MathJax) trước khi tạo
 *   4. Xuất Word trực tiếp từ preview
 * ──────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { User, ExamData, QuestionOption, ImageData } from '../types';
import { parseWordToExam } from '../services/mathWordParserService';
import { exportExamToWord } from '../services/examWordExportService';
import {
  saveBankQuestion,
  updateBankQuestion,
  deleteBankQuestion,
  getBankQuestions,
  getBankTopics,
  loadQuestionImages,
  importQuestionsToBank,
  bankQuestionsToExamData,
  type BankQuestion,
  type BankImage,
  type BankQuestionType,
  type DifficultyLevel,
  type ImportProgress,
} from '../services/questionBankService';

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADES = ['6', '7', '8', '9', '10', '11', '12'];
const LEVELS: DifficultyLevel[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
const TYPES: { value: BankQuestionType; label: string; short: string; color: string; bg: string }[] = [
  { value: 'multiple_choice', label: 'Trắc nghiệm', short: 'TN',  color: 'text-blue-700',   bg: 'bg-blue-100' },
  { value: 'true_false',      label: 'Đúng / Sai',  short: 'Đ/S', color: 'text-green-700',  bg: 'bg-green-100' },
  { value: 'short_answer',    label: 'Trả lời ngắn',short: 'TLN', color: 'text-orange-700', bg: 'bg-orange-100' },
  { value: 'writing',         label: 'Tự luận',     short: 'TL',  color: 'text-purple-700', bg: 'bg-purple-100' },
];
const LEVEL_COLORS: Record<string, string> = {
  'Nhận biết':    'bg-emerald-100 text-emerald-700',
  'Thông hiểu':   'bg-blue-100 text-blue-700',
  'Vận dụng':     'bg-amber-100 text-amber-700',
  'Vận dụng cao': 'bg-red-100 text-red-700',
};

const typeInfo = (t: string) => TYPES.find((x) => x.value === t) ?? TYPES[0];
const levelColor = (l: string) => LEVEL_COLORS[l] ?? 'bg-gray-100 text-gray-600';

// ─── Auto-select algorithm ───────────────────────────────────────────────────

interface TypeCfg {
  enabled: boolean;
  total: number;
  byLevel: Record<DifficultyLevel, number>;
}

function autoSelectQuestions(
  pool: BankQuestion[],
  mc: TypeCfg,
  tf: TypeCfg,
  sa: TypeCfg,
): BankQuestion[] {
  const result: BankQuestion[] = [];
  const usedIds = new Set<string>();

  const pick = (candidates: BankQuestion[], n: number): BankQuestion[] => {
    const available = candidates.filter((q) => !usedIds.has(q.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, n);
    chosen.forEach((q) => usedIds.add(q.id));
    return chosen;
  };

  for (const [type, cfg] of [
    ['multiple_choice', mc],
    ['true_false', tf],
    ['short_answer', sa],
  ] as [BankQuestionType, TypeCfg][]) {
    if (!cfg.enabled || cfg.total === 0) continue;
    const typePool = pool.filter((q) => q.type === type);

    // Pick by level first
    let levelPicked = 0;
    for (const lv of LEVELS) {
      const need = cfg.byLevel[lv] || 0;
      if (!need) continue;
      const chosen = pick(typePool.filter((q) => q.level === lv), need);
      result.push(...chosen);
      levelPicked += chosen.length;
    }

    // Remaining (no level constraint specified)
    const remaining = cfg.total - levelPicked;
    if (remaining > 0) {
      result.push(...pick(typePool, remaining));
    }
  }

  return result;
}

// ─── MathJax helper ──────────────────────────────────────────────────────────

declare global {
  interface Window {
    MathJax?: { typesetPromise?: (el?: HTMLElement[]) => Promise<void>; typesetClear?: (el?: HTMLElement[]) => void };
  }
}

function MathContent({ html, className = '', imageMap = {} }: {
  html: string; className?: string; imageMap?: Record<string, BankImage>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let content = html || '';
    content = content.replace(/\[IMAGE:([^\]]+)\]/g, (_m, id) => {
      const img = imageMap[id];
      if (img?.base64) return `<img src="data:${img.contentType};base64,${img.base64}" style="max-width:100%;margin:4px 0;border-radius:6px;" />`;
      return `<span style="padding:2px 6px;background:#fef3c7;border:1px dashed #f59e0b;border-radius:4px;font-size:11px;">[Hình: ${id}]</span>`;
    });
    ref.current.innerHTML = content;
    const t = setTimeout(() => {
      if (ref.current && window.MathJax?.typesetPromise) {
        window.MathJax.typesetClear?.([ref.current]);
        window.MathJax.typesetPromise([ref.current]).catch(() => {});
      }
    }, 20);
    return () => clearTimeout(t);
  }, [html, imageMap]);
  return <div ref={ref} className={className} />;
}

function BankImagesBlock({ imageMap }: { imageMap: Record<string, BankImage> }) {
  const images = Object.values(imageMap).filter((img) => img.base64);
  if (!images.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {images.map((img) => (
        <div key={img.id} className="flex justify-center">
          <img
            src={img.base64.startsWith('data:') ? img.base64 : `data:${img.contentType};base64,${img.base64}`}
            alt="" className="max-w-full h-auto rounded-lg border border-slate-200 shadow-sm"
            style={{ maxHeight: 260 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── EditModal (unchanged from original) ─────────────────────────────────────

function EditModal({ question, imageMap, onSave, onClose }: {
  question: BankQuestion; imageMap: Record<string, BankImage>;
  onSave: (updated: BankQuestion) => Promise<void>; onClose: () => void;
}) {
  const [q, setQ] = useState<BankQuestion>({ ...question });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const set = (field: keyof BankQuestion, val: any) => setQ((p) => ({ ...p, [field]: val }));
  const setOption = (i: number, field: keyof QuestionOption, val: any) => {
    const opts = [...q.options]; opts[i] = { ...opts[i], [field]: val };
    setQ((p) => ({ ...p, options: opts }));
  };
  const handleSave = async () => {
    setSaving(true);
    try { await onSave(q); onClose(); } catch (e) { alert('❌ Lỗi: ' + (e as Error).message); }
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">✏️ Sửa câu hỏi</h2>
          <div className="flex gap-2 items-center">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {(['edit','preview'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab===t?'bg-white text-slate-700 shadow-sm':'text-slate-400'}`}>
                  {t==='edit'?'✏️ Sửa':'👁️ Xem'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition">✕</button>
          </div>
        </div>
        {tab === 'edit' && (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Khối</label>
                <select value={q.grade} onChange={(e)=>set('grade',e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {GRADES.map((g)=><option key={g} value={g}>Khối {g}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Mức độ</label>
                <select value={q.level} onChange={(e)=>set('level',e.target.value as DifficultyLevel)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {LEVELS.map((l)=><option key={l} value={l}>{l}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Chủ đề</label>
                <input value={q.topic} onChange={(e)=>set('topic',e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/></div>
            </div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1">Nội dung câu hỏi</label>
              <textarea value={q.text} onChange={(e)=>set('text',e.target.value)} rows={4} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"/></div>
            {(q.type==='multiple_choice'||q.type==='true_false') && (
              <div><label className="block text-xs font-semibold text-slate-500 mb-2">Phương án</label>
                <div className="space-y-2">{q.options.map((opt,i)=>(
                  <div key={opt.letter} className={`flex items-start gap-2 p-2.5 rounded-xl border transition ${opt.isCorrect?'border-emerald-400 bg-emerald-50':'border-slate-200'}`}>
                    <button onClick={()=>{const opts=q.options.map((o,j)=>({...o,isCorrect:q.type==='multiple_choice'?j===i:j===i?!o.isCorrect:o.isCorrect}));setQ((p)=>({...p,options:opts}));}}
                      className={`w-7 h-7 rounded-lg text-xs font-bold shrink-0 mt-0.5 transition ${opt.isCorrect?'bg-emerald-500 text-white':'bg-white border border-slate-300 text-slate-500'}`}>{opt.letter}</button>
                    <textarea value={opt.text} onChange={(e)=>setOption(i,'text',e.target.value)} rows={2} className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-none resize-none font-mono"/>
                  </div>))}</div></div>
            )}
            {(q.type==='short_answer'||q.type==='writing') && (
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Đáp án</label>
                <input value={q.correctAnswer||''} onChange={(e)=>set('correctAnswer',e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/></div>
            )}
            <div><label className="block text-xs font-semibold text-slate-500 mb-1">Lời giải</label>
              <textarea value={q.solution} onChange={(e)=>set('solution',e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"/></div>
          </div>
        )}
        {tab === 'preview' && (
          <div className="px-6 py-5">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-3">
              <MathContent html={q.text} imageMap={imageMap} className="text-slate-800 leading-relaxed"/>
              <BankImagesBlock imageMap={imageMap}/>
            </div>
            {q.options.length>0 && <div className="space-y-2 mb-3">{q.options.map((opt)=>(
              <div key={opt.letter} className={`flex items-start gap-3 p-3 rounded-xl border ${opt.isCorrect?'border-emerald-300 bg-emerald-50':'border-slate-200'}`}>
                <span className={`w-7 h-7 rounded-lg text-sm font-bold shrink-0 flex items-center justify-center ${opt.isCorrect?'bg-emerald-500 text-white':'bg-slate-100 text-slate-600'}`}>{opt.letter}</span>
                <MathContent html={opt.text} imageMap={imageMap} className="flex-1 text-sm text-slate-700 pt-0.5"/>
              </div>))}</div>}
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <span className="text-xs text-slate-400">Cập nhật: {question.updatedAt.toLocaleDateString('vi-VN')}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition">Hủy</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 disabled:bg-slate-300 transition">
              {saving?'Đang lưu...':'💾 Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UploadPanel (unchanged) ──────────────────────────────────────────────────

function UploadPanel({ user, onDone }: { user: User; onDone: () => void }) {
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<DifficultyLevel>('Nhận biết');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<{ file: File; questions: any[]; mc:number; tf:number; sa:number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.currentTarget.value = '';
    if (!file) return;
    if (!grade || !topic.trim()) { alert('⚠️ Vui lòng nhập Khối và Chủ đề trước.'); return; }
    setParsing(true);
    try {
      const examData = await parseWordToExam(file);
      const qs = examData.questions;
      setPreview({ file, questions: qs, mc: qs.filter((q:any)=>q.type==='multiple_choice').length, tf: qs.filter((q:any)=>q.type==='true_false').length, sa: qs.filter((q:any)=>q.type==='short_answer').length });
    } catch (err) { alert('❌ Lỗi đọc file: ' + (err as Error).message); }
    setParsing(false);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      await importQuestionsToBank(
        preview.questions.map((q:any)=>({ type: q.type as BankQuestionType, text: q.text, options: q.options||[], correctAnswer: q.correctAnswer??null, solution: q.solution||'', images: q.images||[] })),
        { teacherId: user.id, grade, topic: topic.trim(), level },
        (p) => setProgress(p)
      );
      alert(`✅ Đã lưu ${preview.questions.length} câu vào ngân hàng!`);
      setPreview(null); onDone();
    } catch (err) { alert('❌ Lỗi import: ' + (err as Error).message); }
    setImporting(false); setProgress(null);
  };

  if (importing && progress) {
    const pct = Math.round((progress.done / progress.total) * 100);
    return (
      <div className="bg-white rounded-2xl p-8 shadow-md text-center">
        <div className="text-5xl mb-4">📥</div>
        <p className="font-semibold text-slate-700 mb-3">Đang lưu {progress.done}/{progress.total} câu...</p>
        <div className="w-full bg-slate-100 rounded-full h-3 mb-2"><div className="bg-teal-500 h-3 rounded-full transition-all" style={{width:`${pct}%`}}/></div>
        <p className="text-sm text-slate-400">{pct}% — vui lòng không đóng trang</p>
      </div>
    );
  }
  if (preview) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-md">
        <h3 className="font-bold text-slate-800 mb-4">📋 Xác nhận import</h3>
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
          <p className="font-semibold text-teal-800 mb-3">📄 {preview.file.name}</p>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[{l:'Tổng',v:preview.questions.length,c:'text-teal-700'},{l:'Trắc nghiệm',v:preview.mc,c:'text-blue-700'},{l:'Đúng/Sai',v:preview.tf,c:'text-green-700'},{l:'TLN',v:preview.sa,c:'text-orange-700'}].map(({l,v,c})=>(
              <div key={l} className="bg-white rounded-xl p-3 text-center"><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-slate-500">{l}</div></div>
            ))}
          </div>
          <p className="text-sm text-slate-600">📌 Lưu vào: <strong>Khối {grade}</strong> · <strong>{topic}</strong> · <strong>{level}</strong></p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleImport} className="flex-1 px-5 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition">✅ Xác nhận lưu {preview.questions.length} câu</button>
          <button onClick={()=>setPreview(null)} className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition">Hủy</button>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl p-6 shadow-md space-y-5">
      <div>
        <h3 className="font-bold text-slate-800 mb-1">📤 Upload file Word vào ngân hàng</h3>
        <p className="text-sm text-slate-500">File Word 3 phần Toán chuẩn. Đáp án nhận biết qua gạch chân.</p>
      </div>
      <div><p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Bước 1 — Khối lớp</p>
        <div className="flex gap-2 flex-wrap">{GRADES.map((g)=>(
          <button key={g} onClick={()=>setGrade(g)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${grade===g?'bg-teal-600 text-white border-teal-600':'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}>Khối {g}</button>
        ))}</div></div>
      <div><p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Bước 2 — Chủ đề</p>
        <input value={topic} onChange={(e)=>setTopic(e.target.value)} placeholder="VD: Hàm số bậc hai, Tam giác đồng dạng..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/></div>
      <div><p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Bước 3 — Mức độ mặc định</p>
        <div className="flex gap-2 flex-wrap">{LEVELS.map((l)=>(
          <button key={l} onClick={()=>setLevel(l)} className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition ${level===l?'bg-teal-600 text-white border-teal-600':'bg-white text-slate-600 border-slate-200 hover:border-teal-300'}`}>{l}</button>
        ))}</div></div>
      <div><p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Bước 4 — Chọn file</p>
        <label className={`flex flex-col items-center gap-3 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition ${!grade||!topic.trim()?'opacity-40 cursor-not-allowed border-slate-200':'border-teal-200 hover:border-teal-400 hover:bg-teal-50'}`}>
          <span className="text-4xl">{parsing?'⏳':'📂'}</span>
          <div className="text-center">
            <p className="font-semibold text-teal-700">{parsing?'Đang phân tích...':'Chọn file Word (.docx)'}</p>
            <p className="text-xs text-slate-400 mt-0.5">{!grade||!topic.trim()?'Hoàn thành các bước trên trước':'Click để chọn hoặc kéo thả'}</p>
          </div>
          <input type="file" accept=".docx" disabled={!grade||!topic.trim()||parsing} onChange={handleFile} className="hidden"/>
        </label>
      </div>
    </div>
  );
}

// ─── ✅ NEW: AutoCreateModal ──────────────────────────────────────────────────

interface AutoCreateModalProps {
  user: User;
  allTopics: string[];
  onCreateExam: (examData: ExamData, meta: { title: string; timeLimit: number }) => void;
  onClose: () => void;
}

const DEFAULT_CFG = (): TypeCfg => ({
  enabled: false,
  total: 0,
  byLevel: { 'Nhận biết': 0, 'Thông hiểu': 0, 'Vận dụng': 0, 'Vận dụng cao': 0 },
});

function AutoCreateModal({ user, allTopics, onCreateExam, onClose }: AutoCreateModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [filterGrade, setFilterGrade] = useState('');
  const [mc, setMc] = useState<TypeCfg>({ ...DEFAULT_CFG(), enabled: true, total: 28, byLevel: { 'Nhận biết': 8, 'Thông hiểu': 8, 'Vận dụng': 8, 'Vận dụng cao': 4 } });
  const [tf, setTf] = useState<TypeCfg>({ ...DEFAULT_CFG(), enabled: true, total: 4, byLevel: { 'Nhận biết': 1, 'Thông hiểu': 1, 'Vận dụng': 1, 'Vận dụng cao': 1 } });
  const [sa, setSa] = useState<TypeCfg>({ ...DEFAULT_CFG(), enabled: true, total: 6, byLevel: { 'Nhận biết': 2, 'Thông hiểu': 2, 'Vận dụng': 1, 'Vận dụng cao': 1 } });
  const [bankPool, setBankPool] = useState<BankQuestion[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);
  const [examTitle, setExamTitle] = useState('Đề thi từ ngân hàng câu hỏi');
  const [examTimeLimit, setExamTimeLimit] = useState(90);
  // Preview
  const [previewQs, setPreviewQs] = useState<BankQuestion[]>([]);
  const [previewImages, setPreviewImages] = useState<Record<string, BankImage[]>>({});
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load bank pool when topics or grade changes (step 2)
  const loadPool = useCallback(async () => {
    if (selectedTopics.length === 0) { setBankPool([]); return; }
    setLoadingPool(true);
    try {
      const qs = await getBankQuestions({
        teacherId: user.id,
        grade: filterGrade || undefined,
        topics: selectedTopics,
      });
      setBankPool(qs);
    } catch { setBankPool([]); }
    setLoadingPool(false);
  }, [user.id, selectedTopics, filterGrade]);

  useEffect(() => { if (step === 2) loadPool(); }, [step, loadPool]);

  // Stats: available per type/level
  const stats = (type: BankQuestionType, level?: DifficultyLevel) => {
    const qs = bankPool.filter((q) => q.type === type);
    return level ? qs.filter((q) => q.level === level).length : qs.length;
  };

  const updateTypeCfg = (
    setter: React.Dispatch<React.SetStateAction<TypeCfg>>,
    field: 'total' | 'enabled' | 'level',
    val: any,
    lv?: DifficultyLevel,
  ) => {
    setter((prev) => {
      if (field === 'enabled') return { ...prev, enabled: val };
      if (field === 'total') return { ...prev, total: Math.max(0, Number(val)) };
      if (field === 'level' && lv) return { ...prev, byLevel: { ...prev.byLevel, [lv]: Math.max(0, Number(val)) } };
      return prev;
    });
  };

  // Check total level counts don't exceed total
  const validateCfg = (cfg: TypeCfg, label: string): string | null => {
    if (!cfg.enabled) return null;
    const levelSum = Object.values(cfg.byLevel).reduce((a, b) => a + b, 0);
    if (levelSum > cfg.total) return `${label}: Tổng mức độ (${levelSum}) vượt quá số câu (${cfg.total})`;
    return null;
  };
  const validationError = [
    validateCfg(mc, 'Trắc nghiệm'),
    validateCfg(tf, 'Đúng/Sai'),
    validateCfg(sa, 'Trả lời ngắn'),
  ].filter(Boolean)[0] ?? null;

  const totalRequired = (mc.enabled ? mc.total : 0) + (tf.enabled ? tf.total : 0) + (sa.enabled ? sa.total : 0);

  // Generate preview
  const handleGenerate = async () => {
    setGenerating(true);
    const selected = autoSelectQuestions(bankPool, mc, tf, sa);
    setPreviewQs(selected);
    // Load images for selected questions
    const imgs: Record<string, BankImage[]> = {};
    for (const q of selected) {
      try { imgs[q.id] = await loadQuestionImages(q.id); } catch { imgs[q.id] = []; }
    }
    setPreviewImages(imgs);
    setStep(3);
    setGenerating(false);
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    const selected = autoSelectQuestions(bankPool, mc, tf, sa);
    setPreviewQs(selected);
    const imgs: Record<string, BankImage[]> = { ...previewImages };
    for (const q of selected) {
      if (!imgs[q.id]) {
        try { imgs[q.id] = await loadQuestionImages(q.id); } catch { imgs[q.id] = []; }
      }
    }
    setPreviewImages(imgs);
    setGenerating(false);
  };

  const handleExportWord = async () => {
    setExporting(true);
    try {
      // ✅ FIX: Reload images trước khi xuất Word
      const freshImages: Record<string, BankImage[]> = {};
      for (const q of previewQs) {
        try { freshImages[q.id] = await loadQuestionImages(q.id); }
        catch { freshImages[q.id] = previewImages[q.id] || []; }
      }
      const examData = bankQuestionsToExamData(previewQs, freshImages);
      examData.title = examTitle;
      (examData as any).timeLimit = examTimeLimit;
      await exportExamToWord(examData, { title: examTitle, schoolName: 'LMS Thầy Phúc', includeAnswerKey: false });
    } catch (e) { alert('❌ Lỗi xuất Word: ' + (e as Error).message); }
    setExporting(false);
  };

  const handleCreateOnline = async () => {
    setCreating(true);
    try {
      // ✅ FIX: Reload images mới nhất từ Firestore trước khi tạo đề
      // (previewImages có thể cũ nếu user tạo lại nhiều lần)
      const freshImages: Record<string, BankImage[]> = {};
      for (const q of previewQs) {
        try { freshImages[q.id] = await loadQuestionImages(q.id); }
        catch { freshImages[q.id] = previewImages[q.id] || []; }
      }
      const examData = bankQuestionsToExamData(previewQs, freshImages);
      onCreateExam(examData, { title: examTitle, timeLimit: examTimeLimit });
      onClose();
    } catch (e) { alert('❌ Lỗi tạo đề: ' + (e as Error).message); }
    setCreating(false);
  };

  // ── Render steps ───────────────────────────────────────────────────────────
  const STEP_LABELS = ['1. Chọn chủ đề', '2. Cấu trúc đề', '3. Xem trước'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-base">🎯 Tạo đề theo cấu trúc</h3>
            <p className="text-xs text-slate-400 mt-0.5">Chọn chủ đề → cấu hình số câu/mức độ → xem trước → tạo đề</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition">✕</button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-slate-100">
          {STEP_LABELS.map((label, i) => {
            const s = (i + 1) as 1 | 2 | 3;
            const active = step === s;
            const done = step > s;
            return (
              <button key={s} onClick={() => { if (done || active) setStep(s); }}
                disabled={!done && !active}
                className={`flex-1 py-3 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${active ? 'text-teal-700 border-b-2 border-teal-600' : done ? 'text-slate-500 hover:text-teal-600 cursor-pointer' : 'text-slate-300 cursor-not-allowed'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-teal-600 text-white' : done ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
                  {done ? '✓' : s}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        {/* ── STEP 1: Topics ── */}
        {step === 1 && (
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-700">Chọn chủ đề cần lấy câu hỏi</p>
              <div className="flex gap-2">
                <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="">Tất cả khối</option>
                  {GRADES.map((g) => <option key={g} value={g}>Khối {g}</option>)}
                </select>
                <button onClick={() => setSelectedTopics([...allTopics])}
                  className="px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl text-xs font-medium hover:bg-teal-100">
                  Chọn tất cả
                </button>
                <button onClick={() => setSelectedTopics([])}
                  className="px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-medium hover:bg-slate-100">
                  Bỏ chọn
                </button>
              </div>
            </div>

            {allTopics.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-4xl mb-3">📭</div>
                <p>Ngân hàng chưa có chủ đề nào. Hãy upload câu hỏi trước.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {allTopics.map((t) => {
                  const checked = selectedTopics.includes(t);
                  return (
                    <label key={t} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${checked ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setSelectedTopics((p) => checked ? p.filter((x) => x !== t) : [...p, t])}
                        className="w-4 h-4 accent-teal-600 shrink-0"/>
                      <span className="text-sm text-slate-700 leading-tight">{t}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedTopics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedTopics.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-100 text-teal-800 rounded-full text-xs font-medium">
                    {t}
                    <button onClick={() => setSelectedTopics((p) => p.filter((x) => x !== t))} className="text-teal-500 hover:text-teal-800">✕</button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button onClick={() => setStep(2)} disabled={selectedTopics.length === 0}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition">
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Structure config ── */}
        {step === 2 && (
          <div className="px-6 py-5">
            {loadingPool ? (
              <div className="text-center py-10 text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-3"/>
                <p className="text-sm">Đang tải dữ liệu ngân hàng...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <p className="text-sm font-semibold text-slate-700">Cấu hình số câu từng loại & mức độ</p>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                    Ngân hàng: {bankPool.length} câu
                  </span>
                </div>

                {/* Structure table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 mb-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 border-b border-r border-slate-200 w-32">Loại câu</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 border-b border-r border-slate-200">Tổng câu</th>
                        {LEVELS.map((lv) => (
                          <th key={lv} className={`px-2 py-2.5 text-center text-xs font-semibold border-b border-r border-slate-200 last:border-r-0 ${levelColor(lv)}`}>
                            <span className="block">{lv}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { label: 'Trắc nghiệm', type: 'multiple_choice' as BankQuestionType, cfg: mc, setter: setMc },
                        { label: 'Đúng / Sai', type: 'true_false' as BankQuestionType, cfg: tf, setter: setTf },
                        { label: 'Trả lời ngắn', type: 'short_answer' as BankQuestionType, cfg: sa, setter: setSa },
                      ]).map(({ label, type, cfg, setter }) => {
                        const ti = typeInfo(type);
                        return (
                          <tr key={type} className={cfg.enabled ? '' : 'opacity-40'}>
                            <td className="px-3 py-2.5 border-b border-r border-slate-100">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={cfg.enabled}
                                  onChange={(e) => updateTypeCfg(setter, 'enabled', e.target.checked)}
                                  className="w-4 h-4 accent-teal-600"/>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ti.bg} ${ti.color}`}>{label}</span>
                              </label>
                              <p className="text-[10px] text-slate-400 mt-0.5 pl-6">có {stats(type)} câu</p>
                            </td>
                            <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center">
                              <input type="number" min={0} max={stats(type)} value={cfg.total}
                                onChange={(e) => updateTypeCfg(setter, 'total', e.target.value)}
                                disabled={!cfg.enabled}
                                className="w-16 text-center px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"/>
                              <p className="text-[10px] text-slate-400 mt-0.5">/{stats(type)}</p>
                            </td>
                            {LEVELS.map((lv) => (
                              <td key={lv} className="px-2 py-2.5 border-b border-r border-slate-100 last:border-r-0 text-center">
                                <input type="number" min={0} max={stats(type, lv)} value={cfg.byLevel[lv]}
                                  onChange={(e) => updateTypeCfg(setter, 'level', e.target.value, lv)}
                                  disabled={!cfg.enabled}
                                  className="w-14 text-center px-1 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"/>
                                <p className="text-[10px] text-slate-400 mt-0.5">/{stats(type, lv)}</p>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td className="px-3 py-2.5 text-xs font-bold text-slate-600 border-t border-r border-slate-200">Tổng</td>
                        <td className="px-3 py-2.5 text-center border-t border-r border-slate-200">
                          <span className="font-bold text-teal-600 text-base">{totalRequired}</span>
                          <span className="text-slate-400 text-xs"> câu</span>
                        </td>
                        {LEVELS.map((lv) => {
                          const total = [
                            mc.enabled ? mc.byLevel[lv] : 0,
                            tf.enabled ? tf.byLevel[lv] : 0,
                            sa.enabled ? sa.byLevel[lv] : 0,
                          ].reduce((a, b) => a + b, 0);
                          return (
                            <td key={lv} className="px-2 py-2.5 text-center border-t border-r border-slate-200 last:border-r-0">
                              <span className={`font-bold text-sm ${total > 0 ? 'text-slate-700' : 'text-slate-300'}`}>{total || '—'}</span>
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {validationError && (
                  <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    ⚠️ {validationError}
                  </div>
                )}

                {/* Exam title & time */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tên đề thi</label>
                    <input value={examTitle} onChange={(e) => setExamTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Thời gian làm bài</label>
                    <div className="flex gap-2 flex-wrap">
                      {[45, 60, 90, 120].map((t) => (
                        <button key={t} onClick={() => setExamTimeLimit(t)}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition ${examTimeLimit === t ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}>
                          {t}p
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-between mt-5">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-600 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition">← Quay lại</button>
              <button onClick={handleGenerate} disabled={generating || !!validationError || totalRequired === 0 || bankPool.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition">
                {generating ? <><span className="animate-spin">⟳</span> Đang tạo...</> : <>👁️ Xem trước đề ({totalRequired} câu)</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview ── */}
        {step === 3 && (
          <div className="px-6 py-5">
            {/* Summary */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <p className="text-sm font-semibold text-slate-700">Đề thi: <span className="text-teal-700">{examTitle}</span></p>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{examTimeLimit} phút</span>
              {(['multiple_choice','true_false','short_answer'] as BankQuestionType[]).map((type) => {
                const count = previewQs.filter((q) => q.type === type).length;
                if (!count) return null;
                const ti = typeInfo(type);
                return <span key={type} className={`text-xs font-bold px-2 py-1 rounded-full ${ti.bg} ${ti.color}`}>{ti.short}: {count} câu</span>;
              })}
              <span className="text-xs font-bold text-teal-700 ml-auto">Tổng: {previewQs.length} câu</span>
            </div>

            {/* Question list */}
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1 mb-4">
              {previewQs.map((q, idx) => {
                const ti = typeInfo(q.type);
                const imgMap = Object.fromEntries((previewImages[q.id] || []).map((img) => [img.id, img]));
                return (
                  <div key={q.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-500 w-6">{idx + 1}.</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ti.bg} ${ti.color}`}>{ti.label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${levelColor(q.level)}`}>{q.level}</span>
                      {q.topic && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{q.topic}</span>}
                    </div>
                    <MathContent html={q.text} imageMap={imgMap} className="text-slate-800 text-sm leading-relaxed ml-8"/>
                    <BankImagesBlock imageMap={imgMap}/>
                    {q.options.length > 0 && (
                      <div className="ml-8 mt-2 space-y-1">
                        {q.options.map((opt) => (
                          <div key={opt.letter} className={`flex items-start gap-2 px-2 py-1 rounded-lg text-sm ${opt.isCorrect ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600'}`}>
                            <span className={`shrink-0 font-bold w-5 ${opt.isCorrect ? 'text-emerald-600' : 'text-slate-400'}`}>{opt.letter}.</span>
                            <MathContent html={opt.text} imageMap={imgMap} className="flex-1"/>
                            {opt.isCorrect && <span className="text-emerald-600 shrink-0">✓</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-slate-600 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition">← Sửa cấu trúc</button>
              <button onClick={handleRegenerate} disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-700 rounded-xl text-sm font-semibold hover:bg-amber-100 transition disabled:opacity-50">
                {generating ? <span className="animate-spin">⟳</span> : '🔀'} Tạo lại
              </button>
              <div className="flex gap-2 ml-auto">
                <button onClick={handleExportWord} disabled={exporting}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:bg-slate-300 transition">
                  {exporting ? <><span className="animate-spin">⟳</span> Đang xuất...</> : '📄 Xuất Word'}
                </button>
                <button onClick={handleCreateOnline} disabled={creating}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:bg-slate-300 transition">
                  {creating ? <><span className="animate-spin">⟳</span> Đang tạo...</> : '🏗️ Tạo đề online'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface QuestionBankTabProps {
  user: User;
  classes: { id: string; name: string }[];
  onCreateExam: (examData: ExamData, meta: { title: string; timeLimit: number }) => void;
}

type Screen = 'browse' | 'upload';

// ─── Main component ───────────────────────────────────────────────────────────

const QuestionBankTab: React.FC<QuestionBankTabProps> = ({ user, classes, onCreateExam }) => {
  const [screen, setScreen] = useState<Screen>('browse');

  // ✅ Multi-topic filter (replaces single filterTopic)
  const [filterGrade, setFilterGrade] = useState('');
  const [filterTopics, setFilterTopics] = useState<string[]>([]);   // NEW: multi-topic
  const [showTopicPicker, setShowTopicPicker] = useState(false);    // NEW: topic dropdown
  const [filterLevel, setFilterLevel] = useState('');
  const [filterType, setFilterType] = useState('');

  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingQ, setEditingQ] = useState<BankQuestion | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, BankImage[]>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  // Exam builder modals
  const [showBuildExam, setShowBuildExam] = useState(false);
  const [showAutoCreate, setShowAutoCreate] = useState(false);   // ✅ NEW
  const [examTitle, setExamTitle] = useState('Đề thi từ ngân hàng câu hỏi');
  const [examTimeLimit, setExamTimeLimit] = useState(45);
  const [buildingExam, setBuildingExam] = useState(false);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = await getBankQuestions({
        teacherId: user.id,
        grade: filterGrade || undefined,
        topics: filterTopics.length > 0 ? filterTopics : undefined,
        level: filterLevel || undefined,
        type: filterType || undefined,
      });
      setQuestions(qs);
      setSelected(new Set());
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [user.id, filterGrade, filterTopics, filterLevel, filterType]);

  const loadTopics = useCallback(async () => {
    try { setTopics(await getBankTopics(user.id, filterGrade || undefined)); } catch {}
  }, [user.id, filterGrade]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);
  useEffect(() => { loadTopics(); }, [loadTopics]);

  const ensureImages = async (q: BankQuestion) => {
    if (imageCache[q.id] || loadingImages.has(q.id)) return;
    setLoadingImages((p) => new Set(p).add(q.id));
    try { const imgs = await loadQuestionImages(q.id); setImageCache((p) => ({ ...p, [q.id]: imgs })); } catch {}
    setLoadingImages((p) => { const s = new Set(p); s.delete(q.id); return s; });
  };

  const handleExpand = (q: BankQuestion) => {
    const newId = expandedId === q.id ? null : q.id;
    setExpandedId(newId);
    if (newId) ensureImages(q);
  };

  const getImageMap = (qId: string): Record<string, BankImage> =>
    Object.fromEntries((imageCache[qId] || []).map((img) => [img.id, img]));

  const handleDelete = async (q: BankQuestion) => {
    if (!confirm(`Xóa câu hỏi này?\n\n${q.text.replace(/<[^>]*>/g,'').slice(0,100)}...`)) return;
    try {
      await deleteBankQuestion(q.id);
      setQuestions((p) => p.filter((x) => x.id !== q.id));
      setSelected((p) => { const s = new Set(p); s.delete(q.id); return s; });
    } catch (err) { alert('❌ Lỗi xóa: ' + (err as Error).message); }
  };

  const handleSaveEdit = async (updated: BankQuestion) => {
    await updateBankQuestion(updated.id, { grade: updated.grade, topic: updated.topic, level: updated.level, type: updated.type, text: updated.text, options: updated.options, correctAnswer: updated.correctAnswer, solution: updated.solution });
    setQuestions((p) => p.map((q) => q.id === updated.id ? updated : q));
    setEditingQ(null);
  };

  const toggleSelect = (id: string) => setSelected((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleBuildExam = async () => {
    const selectedQs = questions.filter((q) => selected.has(q.id));
    if (!selectedQs.length) { alert('⚠️ Chưa chọn câu nào!'); return; }
    setBuildingExam(true);

    // ✅ FIX: Luôn reload images từ Firestore, không dùng imageCache.
    // imageCache có thể chứa [] (array rỗng = truthy) nếu ảnh chưa kịp load
    // khi user expand câu hỏi → dùng cache sẽ miss ảnh thực tế có trong bank.
    const loadedImages: Record<string, BankImage[]> = {};
    for (const q of selectedQs) {
      try {
        loadedImages[q.id] = await loadQuestionImages(q.id);
        // Update cache với data mới nhất
        setImageCache((p) => ({ ...p, [q.id]: loadedImages[q.id] }));
      } catch {
        loadedImages[q.id] = [];
      }
    }
    try {
      const examData = bankQuestionsToExamData(selectedQs, loadedImages);
      onCreateExam(examData, { title: examTitle, timeLimit: examTimeLimit });
      setShowBuildExam(false); setSelected(new Set());
    } catch (err) { alert('❌ Lỗi tạo đề: ' + (err as Error).message); }
    setBuildingExam(false);
  };

  if (screen === 'upload') {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setScreen('browse')} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition text-sm">← Quay lại</button>
          <h2 className="text-lg font-bold text-slate-800">Upload câu hỏi</h2>
        </div>
        <UploadPanel user={user} onDone={() => { setScreen('browse'); loadQuestions(); loadTopics(); }}/>
      </div>
    );
  }

  const selectedCount = selected.size;
  const activeTopicCount = filterTopics.length;

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">🗄️ Ngân hàng câu hỏi</h2>
          <p className="text-sm text-slate-500 mt-0.5">{questions.length} câu · Chọn câu để tạo đề online</p>
        </div>
        <div className="flex gap-2">
          {/* ✅ NEW: Tạo đề tự động button */}
          <button onClick={() => setShowAutoCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition shadow-sm">
            🎯 Tạo đề tự động
          </button>
          <button onClick={() => setScreen('upload')}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 transition shadow-sm">
            📤 Upload câu mới
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 shadow-md mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Grade */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Khối</label>
            <select value={filterGrade} onChange={(e) => { setFilterGrade(e.target.value); setFilterTopics([]); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">Tất cả</option>
              {GRADES.map((g) => <option key={g} value={g}>Khối {g}</option>)}
            </select>
          </div>

          {/* ✅ NEW: Multi-topic filter */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Chủ đề</label>
            <button onClick={() => setShowTopicPicker(!showTopicPicker)}
              className={`w-full px-3 py-2 border rounded-xl text-sm text-left flex items-center justify-between transition ${activeTopicCount > 0 ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-500'} focus:outline-none`}>
              <span className="truncate">{activeTopicCount > 0 ? `${activeTopicCount} chủ đề` : 'Tất cả'}</span>
              <span className="ml-1 shrink-0">{showTopicPicker ? '▲' : '▼'}</span>
            </button>
            {showTopicPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                <div className="p-2 border-b border-slate-100 flex gap-2">
                  <button onClick={() => setFilterTopics([...topics])} className="flex-1 text-xs py-1 bg-teal-50 text-teal-700 rounded-lg font-medium hover:bg-teal-100">Tất cả</button>
                  <button onClick={() => setFilterTopics([])} className="flex-1 text-xs py-1 bg-slate-50 text-slate-600 rounded-lg font-medium hover:bg-slate-100">Bỏ chọn</button>
                </div>
                {topics.map((t) => (
                  <label key={t} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={filterTopics.includes(t)}
                      onChange={() => setFilterTopics((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                      className="w-3.5 h-3.5 accent-teal-600"/>
                    <span className="text-sm text-slate-700 truncate">{t}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Level */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Mức độ</label>
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">Tất cả</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Loại câu</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">Tất cả</option>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Active topic chips */}
        {activeTopicCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            {filterTopics.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-100 text-teal-800 rounded-full text-xs font-medium">
                {t}
                <button onClick={() => setFilterTopics((p) => p.filter((x) => x !== t))} className="text-teal-500 hover:text-teal-900">✕</button>
              </span>
            ))}
            <button onClick={() => setFilterTopics([])} className="text-xs text-slate-400 hover:text-slate-600 underline">Xóa tất cả</button>
          </div>
        )}
      </div>

      {/* Selection toolbar */}
      {questions.length > 0 && (
        <div className="bg-white rounded-2xl px-4 py-3 shadow-md mb-4 flex items-center gap-3 flex-wrap">
          <button onClick={() => setSelected(new Set(questions.map((q) => q.id)))}
            className="text-sm px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 font-medium">
            Chọn tất cả ({questions.length})
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-sm px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 font-medium">
            Bỏ chọn
          </button>
          {selectedCount > 0 && (
            <button onClick={() => setShowBuildExam(true)}
              className="ml-auto flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition shadow-sm">
              🏗️ Tạo đề từ {selectedCount} câu đã chọn
            </button>
          )}
        </div>
      )}

      {/* Click outside topic picker */}
      {showTopicPicker && <div className="fixed inset-0 z-20" onClick={() => setShowTopicPicker(false)}/>}

      {/* Questions list */}
      {loading ? (
        <div className="bg-white rounded-2xl p-16 shadow-md text-center text-slate-400">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-4"/>
          <p>Đang tải câu hỏi...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 shadow-md text-center text-slate-300">
          <div className="text-6xl mb-4">🗄️</div>
          <p className="text-slate-500 font-medium">Chưa có câu hỏi nào</p>
          <p className="text-sm text-slate-400 mt-1">Nhấn "Upload câu mới" để import từ file Word</p>
          <button onClick={() => setScreen('upload')}
            className="mt-4 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 transition">
            📤 Upload ngay
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => {
            const isExpanded = expandedId === q.id;
            const isSelected = selected.has(q.id);
            const imgMap = getImageMap(q.id);
            const ti = typeInfo(q.type);
            const plainText = q.text.replace(/<[^>]*>/g,'').replace(/\$[^$]*\$/g,'[CT]').trim();

            return (
              <div key={q.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${isSelected ? 'border-teal-400 shadow-md' : 'border-slate-100 hover:border-teal-200'}`}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(q.id)}
                    className="mt-1.5 w-4 h-4 accent-teal-600 shrink-0 cursor-pointer"/>
                  <span className="text-xs text-slate-300 font-mono mt-1.5 shrink-0 w-6">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ti.bg} ${ti.color}`}>{ti.label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${levelColor(q.level)}`}>{q.level}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Khối {q.grade}</span>
                      {q.topic && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{q.topic}</span>}
                    </div>
                    {!isExpanded && (
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{plainText.length > 140 ? plainText.slice(0, 140) + '...' : plainText}</p>
                    )}
                    {isExpanded && (
                      <div className="mt-2">
                        {loadingImages.has(q.id) && <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><span className="animate-spin">⟳</span> Đang tải hình...</p>}
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-3">
                          <MathContent html={q.text} imageMap={imgMap} className="text-slate-800 text-sm leading-relaxed"/>
                          <BankImagesBlock imageMap={imgMap}/>
                        </div>
                        {q.options.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {q.options.map((opt) => (
                              <div key={opt.letter} className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border text-sm ${opt.isCorrect ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
                                <span className={`w-6 h-6 rounded-lg text-xs font-bold shrink-0 flex items-center justify-center ${opt.isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{opt.letter}</span>
                                <MathContent html={opt.text} imageMap={imgMap} className="flex-1 text-slate-700 pt-0.5"/>
                                {opt.isCorrect && <span className="text-emerald-600 text-xs font-bold shrink-0">✓</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.correctAnswer && q.options.length === 0 && (
                          <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm mb-3">
                            <span className="font-bold text-emerald-700 mr-2">Đáp án:</span>
                            <MathContent html={q.correctAnswer} imageMap={{}} className="inline text-emerald-800"/>
                          </div>
                        )}
                        {q.solution && (
                          <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                            <span className="font-bold">Lời giải: </span>
                            <MathContent html={q.solution} imageMap={imgMap} className="inline text-blue-800"/>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleExpand(q)} className="p-1.5 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition" title="Xem chi tiết">{isExpanded ? '🙈' : '👁️'}</button>
                    <button onClick={() => { ensureImages(q); setEditingQ({ ...q }); }} className="p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition" title="Sửa">✏️</button>
                    <button onClick={() => handleDelete(q)} className="p-1.5 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Xóa">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editingQ && (
        <EditModal question={editingQ} imageMap={getImageMap(editingQ.id)} onSave={handleSaveEdit} onClose={() => setEditingQ(null)}/>
      )}

      {/* ✅ NEW: AutoCreate modal */}
      {showAutoCreate && (
        <AutoCreateModal user={user} allTopics={topics} onCreateExam={onCreateExam} onClose={() => setShowAutoCreate(false)}/>
      )}

      {/* Manual build exam modal (matrix view) */}
      {showBuildExam && (() => {
        const selectedQs = questions.filter((q) => selected.has(q.id));
        const COLS: { type: BankQuestionType; label: string; color: string }[] = [
          { type: 'multiple_choice', label: 'Trắc nghiệm', color: 'bg-blue-100 text-blue-700' },
          { type: 'true_false',      label: 'Đúng / Sai',  color: 'bg-green-100 text-green-700' },
          { type: 'short_answer',    label: 'Trả lời ngắn',color: 'bg-orange-100 text-orange-700' },
        ];
        const matrix: Record<string, BankQuestion[]> = {};
        const key = (lv: string, type: string) => `${lv}__${type}`;
        for (const q of selectedQs) {
          const k = key(q.level, q.type);
          if (!matrix[k]) matrix[k] = [];
          matrix[k].push(q);
        }
        const rowTotal = (lv: DifficultyLevel) => COLS.reduce((s, c) => s + (matrix[key(lv, c.type)]?.length || 0), 0);
        const colTotal = (type: BankQuestionType) => LEVELS.reduce((s, lv) => s + (matrix[key(lv, type)]?.length || 0), 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 my-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800">📊 Ma trận đề thi</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedQs.length} câu đã chọn</p>
                </div>
                <button onClick={() => setShowBuildExam(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition">✕</button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b border-r border-slate-200 w-36">Mức độ</th>
                        {COLS.map((c) => <th key={c.type} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 border-b border-r border-slate-200 last:border-r-0"><span className={`px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span></th>)}
                        <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500 border-b border-slate-200">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LEVELS.map((lv) => {
                        const rt = rowTotal(lv);
                        if (!rt) return null;
                        return (
                          <tr key={lv} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 border-b border-r border-slate-100">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${levelColor(lv)}`}>{lv}</span>
                            </td>
                            {COLS.map((c) => {
                              const qs = matrix[key(lv, c.type)] || [];
                              return (
                                <td key={c.type} className="px-3 py-3 text-center border-b border-r border-slate-100 last:border-r-0">
                                  {qs.length > 0 ? <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl font-bold ${c.color}`}>{qs.length}</span> : <span className="text-slate-200 text-xs">—</span>}
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-center border-b border-slate-100"><span className="font-bold text-slate-700">{rt}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td className="px-4 py-3 text-xs font-bold text-slate-600 border-t border-r border-slate-200">Tổng</td>
                        {COLS.map((c) => { const t = colTotal(c.type); return <td key={c.type} className="px-3 py-3 text-center border-t border-r border-slate-200 last:border-r-0"><span className={`font-bold ${t>0?'text-slate-700':'text-slate-300'}`}>{t||'—'}</span></td>; })}
                        <td className="px-3 py-3 text-center border-t border-slate-200"><span className="font-bold text-teal-600 text-base">{selectedQs.length}</span></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tên đề thi</label>
                  <input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Thời gian</label>
                  <div className="flex gap-2 flex-wrap">
                    {[15, 30, 45, 60, 90, 120].map((t) => (
                      <button key={t} onClick={() => setExamTimeLimit(t)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${examTimeLimit===t?'bg-teal-600 text-white border-teal-600':'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}>
                        {t} phút
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setShowBuildExam(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition text-sm font-medium">Hủy</button>
                <button onClick={handleBuildExam} disabled={buildingExam||selectedQs.length===0}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition">
                  {buildingExam?<><span className="animate-spin">⟳</span> Đang xử lý...</>:<>➡️ Tạo đề ({selectedQs.length} câu) — Cấu hình điểm</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default QuestionBankTab;
