import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ExamPointsConfig, SectionPointsConfig, TrueFalseMode } from '../types';
import { validatePointsConfig } from '../services/scoringService';

interface PointsConfigEditorProps {
  config: ExamPointsConfig;
  onChange: (newConfig: ExamPointsConfig) => void | Promise<void>;
  onClose?: () => void;
  /** Không tự đóng modal khi bấm Lưu; chỉ đóng khi parent xử lý xong */
  closeOnSave?: boolean;
  /** Trạng thái đang lưu (để disable UI) */
  isSaving?: boolean;
}

const PointsConfigEditor: React.FC<PointsConfigEditorProps> = ({
  config,
  onChange,
  onClose,
  closeOnSave = true,
  isSaving = false
}) => {
  const [localConfig, setLocalConfig] = useState<ExamPointsConfig>(config);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const totalPoints = useMemo(
    () => localConfig.sections.reduce((sum, s) => sum + s.totalPoints, 0),
    [localConfig.sections]
  );

  const isBalanced = Math.abs(totalPoints - localConfig.maxScore) < 0.01;

  // ===== Đổi thang điểm max =====
  const handleMaxScoreChange = (newMaxScore: number) => {
    const safeOld = localConfig.maxScore || 10;
    const ratio = safeOld > 0 ? newMaxScore / safeOld : 1;

    const updatedSections = localConfig.sections.map((s) => {
      const newTotal = parseFloat((s.totalPoints * ratio).toFixed(2));
      return {
        ...s,
        totalPoints: newTotal,
        pointsPerQuestion: parseFloat((newTotal / s.totalQuestions).toFixed(4))
      };
    });

    // Điều chỉnh để tổng chính xác
    const currentTotal = updatedSections.reduce((sum, s) => sum + s.totalPoints, 0);
    if (updatedSections.length > 0 && Math.abs(currentTotal - newMaxScore) > 0.01) {
      const diff = newMaxScore - currentTotal;
      const last = updatedSections.length - 1;
      updatedSections[last].totalPoints = parseFloat(
        (updatedSections[last].totalPoints + diff).toFixed(2)
      );
      updatedSections[last].pointsPerQuestion = parseFloat(
        (updatedSections[last].totalPoints / updatedSections[last].totalQuestions).toFixed(4)
      );
    }

    setLocalConfig({ ...localConfig, maxScore: newMaxScore, sections: updatedSections });
  };

  // ===== Đổi điểm từng section =====
  const handleSectionPointsChange = (sectionId: string, newPoints: number) => {
    const updatedSections = localConfig.sections.map((s) => {
      if (s.sectionId === sectionId) {
        return {
          ...s,
          totalPoints: newPoints,
          pointsPerQuestion: parseFloat((newPoints / s.totalQuestions).toFixed(4))
        };
      }
      return s;
    });
    setLocalConfig({ ...localConfig, sections: updatedSections });
  };

  // ===== Đổi mode chấm Đúng/Sai =====
  const handleSectionModeChange = (sectionId: string, mode: TrueFalseMode) => {
    const updatedSections = localConfig.sections.map((s) =>
      s.sectionId === sectionId ? { ...s, trueFalseMode: mode } : s
    );
    setLocalConfig({ ...localConfig, sections: updatedSections });
  };

  // ===== Tự động cân bằng =====
  const handleAutoBalance = () => {
    const totalQ = localConfig.sections.reduce((sum, s) => sum + s.totalQuestions, 0);

    const updatedSections = localConfig.sections.map((s) => {
      const ratio = totalQ > 0 ? s.totalQuestions / totalQ : 0;
      const totalPts = parseFloat((localConfig.maxScore * ratio).toFixed(2));
      return {
        ...s,
        totalPoints: totalPts,
        pointsPerQuestion: parseFloat((totalPts / s.totalQuestions).toFixed(4))
      };
    });

    const currentTotal = updatedSections.reduce((sum, s) => sum + s.totalPoints, 0);
    if (updatedSections.length > 0 && Math.abs(currentTotal - localConfig.maxScore) > 0.01) {
      const diff = localConfig.maxScore - currentTotal;
      const last = updatedSections.length - 1;
      updatedSections[last].totalPoints = parseFloat(
        (updatedSections[last].totalPoints + diff).toFixed(2)
      );
      updatedSections[last].pointsPerQuestion = parseFloat(
        (updatedSections[last].totalPoints / updatedSections[last].totalQuestions).toFixed(4)
      );
    }

    setLocalConfig({ ...localConfig, sections: updatedSections, autoBalance: true });
  };

  // ===== Lưu =====
  const handleSave = async () => {
    const validation = validatePointsConfig(localConfig);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);
    await onChange(localConfig);
    if (closeOnSave && onClose) onClose();
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full max-h-[92vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div
        className="p-6 text-white sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
      >
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <span>⚙️</span> Cấu hình điểm số
        </h2>
        <p className="text-orange-100 mt-1">Tùy chỉnh điểm cho từng phần của đề thi</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28">
        {/* Thang điểm */}
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-xl p-5 border-2 border-teal-200">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            📊 Thang điểm tối đa
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              type="number"
              value={localConfig.maxScore}
              onChange={(e) => handleMaxScoreChange(parseFloat(e.target.value) || 0)}
              min="1"
              max="100"
              step="0.5"
              disabled={isSaving}
              className="flex-1 px-4 py-3 border-2 border-teal-300 rounded-lg text-lg font-bold focus:border-teal-500 focus:outline-none disabled:bg-gray-100"
            />
            <button
              onClick={handleAutoBalance}
              disabled={isSaving}
              className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition whitespace-nowrap disabled:opacity-60"
            >
              🔄 Tự động cân bằng
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            💡 Tự động cân bằng sẽ chia đều điểm theo tỷ lệ số câu hỏi
          </p>
        </div>

        {/* Tổng điểm hiện tại */}
        <div
          className={`p-4 rounded-xl border-2 ${
            isBalanced ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">Tổng điểm các phần:</span>
            <span
              className={`text-2xl font-bold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}
            >
              {totalPoints.toFixed(2)} / {localConfig.maxScore}
            </span>
          </div>
          {!isBalanced && (
            <p className="text-red-600 text-sm mt-2">
              ⚠️ Tổng điểm chưa bằng thang điểm! Chênh lệch:{' '}
              {(totalPoints - localConfig.maxScore).toFixed(2)}
            </p>
          )}
        </div>

        {/* Danh sách section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span>📝</span> Điểm từng phần
          </h3>
          {localConfig.sections.map((section, index) => (
            <SectionPointsCard
              key={section.sectionId}
              section={section}
              index={index}
              disabled={isSaving}
              onChange={(newPoints) => handleSectionPointsChange(section.sectionId, newPoints)}
              onModeChange={(mode) => handleSectionModeChange(section.sectionId, mode)}
            />
          ))}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <h4 className="font-bold text-red-700 mb-2">❌ Lỗi:</h4>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((err, idx) => (
                <li key={idx} className="text-red-600 text-sm">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer sticky */}
      <div className="p-4 sm:p-6 bg-gray-50 border-t sticky bottom-0 z-10">
        <div className="flex flex-col sm:flex-row gap-3">
          {onClose && (
            <button
              onClick={onClose}
              disabled={isSaving}
              className="sm:flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl font-semibold hover:bg-gray-100 transition disabled:opacity-60"
            >
              Hủy
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isBalanced || isSaving}
            className={`sm:flex-1 px-6 py-3 rounded-xl font-bold text-white transition ${
              !isBalanced || isSaving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700'
            }`}
          >
            {isSaving ? '⏳ Đang lưu...' : '✅ Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SECTION CARD
// ============================================================

const SectionPointsCard: React.FC<{
  section: SectionPointsConfig;
  index: number;
  disabled?: boolean;
  onChange: (newPoints: number) => void;
  onModeChange?: (mode: TrueFalseMode) => void;
}> = ({ section, disabled = false, onChange, onModeChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(section.totalPoints.toString());

  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Mode hiện tại (default = 'stepped' — thang BGD)
  const tfMode: TrueFalseMode = section.trueFalseMode ?? 'stepped';

  // Sync khi section update từ parent
  useEffect(() => {
    if (!isEditing) setTempValue(section.totalPoints.toString());
  }, [section.totalPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Khi bật edit: auto scroll + focus
  useEffect(() => {
    if (!isEditing) return;
    const t = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(t);
  }, [isEditing]);

  const typeInfo: Record<
    SectionPointsConfig['questionType'],
    { icon: string; label: string; color: string }
  > = {
    multiple_choice: { icon: '🔘', label: 'Trắc nghiệm',  color: 'from-blue-400 to-blue-500' },
    true_false:      { icon: '✅', label: 'Đúng/Sai',     color: 'from-green-400 to-green-500' },
    short_answer:    { icon: '✏️', label: 'Trả lời ngắn', color: 'from-orange-400 to-orange-500' }
  };

  const info = typeInfo[section.questionType];

  const commit = () => {
    const value = parseFloat(tempValue);
    if (!isNaN(value) && value >= 0) onChange(value);
    setIsEditing(false);
  };

  const cancel = () => {
    setTempValue(section.totalPoints.toString());
    setIsEditing(false);
  };

  // Hàng preview theo từng mode
  const equalRows    = [0.25, 0.50, 0.75, 1.00];
  const steppedRatios = [0.10, 0.25, 0.50, 1.00];

  return (
    <div
      ref={cardRef}
      className="bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition"
    >
      {/* Header */}
      <div
        className={`bg-gradient-to-r ${info.color} text-white p-4 flex items-center justify-between`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{info.icon}</span>
          <div>
            <h4 className="font-bold">{section.sectionName}</h4>
            <p className="text-sm opacity-90">{info.label}</p>
          </div>
        </div>
        <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">
          {section.totalQuestions} câu
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Tổng điểm */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tổng điểm phần này</label>
            {isEditing ? (
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  type="number"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  min="0"
                  step="0.25"
                  disabled={disabled}
                  className="flex-1 px-3 py-2 border-2 border-orange-300 rounded-lg focus:border-orange-500 focus:outline-none disabled:bg-gray-100"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') cancel();
                  }}
                />
                <button
                  onClick={commit}
                  disabled={disabled}
                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-60"
                  title="Lưu"
                >
                  ✓
                </button>
                <button
                  onClick={cancel}
                  disabled={disabled}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-60"
                  title="Hủy"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { if (!disabled) setIsEditing(true); }}
                className={`w-full text-left px-3 py-2 bg-orange-100 border-2 border-orange-300 rounded-lg font-bold text-orange-700 ${
                  disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-orange-200'
                } transition`}
              >
                {section.totalPoints.toFixed(2)} điểm • bấm để sửa 📝
              </button>
            )}
          </div>

          {/* Điểm mỗi câu */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Điểm mỗi câu</label>
            <div className="px-3 py-2 bg-teal-100 border-2 border-teal-300 rounded-lg font-bold text-teal-700">
              {section.pointsPerQuestion.toFixed(4)}
            </div>
          </div>
        </div>

        {/* ── Chỉ hiện cho Đúng/Sai ── */}
        {section.questionType === 'true_false' && (
          <div className="mt-4 space-y-3">
            {/* Toggle mode */}
            <p className="text-xs text-gray-600 font-semibold">⚙️ Cách tính điểm Đúng/Sai:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Chia đều */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onModeChange?.('equal')}
                className={`p-3 rounded-xl border-2 text-left transition ${
                  tfMode === 'equal'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {/* radio dot */}
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      tfMode === 'equal' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {tfMode === 'equal' && (
                      <span className="w-2 h-2 bg-white rounded-full block" />
                    )}
                  </span>
                  <span className="font-semibold text-sm text-gray-800">Chia đều</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">Mỗi ý đúng = điểm/câu ÷ 4</p>
              </button>

              {/* Thang bậc BGD */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onModeChange?.('stepped')}
                className={`p-3 rounded-xl border-2 text-left transition ${
                  tfMode === 'stepped'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-green-300'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      tfMode === 'stepped' ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}
                  >
                    {tfMode === 'stepped' && (
                      <span className="w-2 h-2 bg-white rounded-full block" />
                    )}
                  </span>
                  <span className="font-semibold text-sm text-gray-800">Thang bậc BGD</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  1ý→10% · 2ý→25% · 3ý→50% · 4ý→100%
                </p>
              </button>
            </div>

            {/* Preview bảng điểm */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 font-semibold mb-2">
                📌 Quy tắc chấm{' '}
                {tfMode === 'stepped' ? '(Thang bậc BGD)' : '(Chia đều)'}:
              </p>
              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                {(tfMode === 'stepped' ? steppedRatios : equalRows).map((ratio, i) => {
                  const label = `${i + 1}/4 ý`;
                  const pts = (section.pointsPerQuestion * ratio).toFixed(3);
                  const isMax = i === 3;
                  return (
                    <div key={i}>
                      <div
                        className={`font-bold ${isMax ? 'text-green-600' : 'text-blue-600'}`}
                      >
                        {label}
                      </div>
                      <div
                        className={`${isMax ? 'text-green-700 font-bold' : 'text-gray-600'}`}
                      >
                        {pts}đ
                      </div>
                      {tfMode === 'stepped' && (
                        <div className="text-gray-400 text-[10px]">
                          {(ratio * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {tfMode === 'stepped' && (
                <p className="text-xs text-blue-600 mt-2 italic">
                  ✨ Theo quy định BGD: trả lời đúng 0 ý không được điểm
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PointsConfigEditor;
