import React from 'react';
import { Submission, Room, Exam, Question, QuestionOption } from '../types';
import MathText from './MathText';
import { formatScore } from '../services/scoringService';

interface ResultViewProps {
  submission: Submission;
  room: Room;
  exam?: Exam;
  showAnswers?: boolean; // ⚠️ DEPRECATED - sẽ dùng room.settings thay thế
  onExit: () => void;
  onRetry?: () => void;
}

const escapeHtml = (s: string) =>
  (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ResultView: React.FC<ResultViewProps> = ({
  submission,
  room,
  exam,
  showAnswers = true, // deprecated
  onExit,
  onRetry
}) => {
  // ✅ MỚI: Lấy settings từ room
  const canShowCorrectAnswers = room.settings?.showCorrectAnswers ?? true;
  const canShowExplanations = room.settings?.showExplanations ?? true;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} phút ${secs} giây`;
  };

  const getGrade = (percentage: number) => {
    if (percentage >= 90) return { grade: 'A+', color: 'text-green-600', bg: 'bg-green-100', emoji: '🏆', label: 'Xuất sắc' };
    if (percentage >= 80) return { grade: 'A', color: 'text-green-600', bg: 'bg-green-100', emoji: '🌟', label: 'Giỏi' };
    if (percentage >= 70) return { grade: 'B+', color: 'text-blue-600', bg: 'bg-blue-100', emoji: '👍', label: 'Khá' };
    if (percentage >= 60) return { grade: 'B', color: 'text-blue-600', bg: 'bg-blue-100', emoji: '📚', label: 'Trung bình khá' };
    if (percentage >= 50) return { grade: 'C', color: 'text-yellow-600', bg: 'bg-yellow-100', emoji: '💪', label: 'Trung bình' };
    if (percentage >= 40) return { grade: 'D', color: 'text-orange-600', bg: 'bg-orange-100', emoji: '📖', label: 'Yếu' };
    return { grade: 'F', color: 'text-red-600', bg: 'bg-red-100', emoji: '😞', label: 'Kém' };
  };

  const gradeInfo = getGrade(submission.percentage);
  const maxScore = exam?.pointsConfig?.maxScore || 10;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)' }}>
      {/* Confetti for high scores */}
      {submission.percentage >= 80 && (
        <style>{`
          @keyframes confetti {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
          }
          .confetti {
            position: fixed;
            top: -10px;
            animation: confetti 3s ease-in-out forwards;
          }
        `}</style>
      )}
      {submission.percentage >= 80 && (
        <>
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="confetti text-2xl"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`
              }}
            >
              {['🎉', '⭐', '🌟', '✨', '🎊'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </>
      )}

      {/* Header */}
      <div
        className="text-white p-6"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)' }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-2">🎉 Đã nộp bài thành công!</h1>
          <p className="text-teal-100">{room.examTitle}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Score Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8">
          {/* Grade Badge */}
          <div className="text-center mb-6">
            <div className={`w-32 h-32 ${gradeInfo.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <div>
                <div className="text-4xl mb-1">{gradeInfo.emoji}</div>
                <div className={`text-3xl font-bold ${gradeInfo.color}`}>{gradeInfo.grade}</div>
              </div>
            </div>
            <div className={`inline-block px-4 py-2 rounded-full ${gradeInfo.bg} ${gradeInfo.color} font-semibold`}>
              {gradeInfo.label}
            </div>
          </div>

          {/* Main Score */}
          <div className="text-center mb-8">
            <div className="text-6xl font-bold mb-2">
              <span className="text-teal-600">{formatScore(submission.totalScore)}</span>
              <span className="text-gray-400">/{maxScore}</span>
            </div>
            <div className="text-3xl font-bold text-gray-500">
              {submission.percentage}%
            </div>
          </div>

          {/* Score Breakdown by Section */}
          {submission.scoreBreakdown && (
            <div className="mb-8">
              <h3 className="text-center text-lg font-bold text-gray-700 mb-4">📊 Chi tiết điểm từng phần</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Multiple Choice */}
                {submission.scoreBreakdown.multipleChoice.total > 0 && (
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-300">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🔘</span>
                      <span className="font-bold text-blue-900">Trắc nghiệm</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      {formatScore(submission.scoreBreakdown.multipleChoice.points)}
                    </div>
                    <div className="text-sm text-blue-700 mb-1">
                      Đúng {submission.scoreBreakdown.multipleChoice.correct}/{submission.scoreBreakdown.multipleChoice.total}
                    </div>
                    {submission.scoreBreakdown.multipleChoice.pointsPerQuestion && (
                      <div className="text-xs text-blue-600">
                        ({formatScore(submission.scoreBreakdown.multipleChoice.pointsPerQuestion)} điểm/câu)
                      </div>
                    )}
                  </div>
                )}

                {/* True/False */}
                {submission.scoreBreakdown.trueFalse.total > 0 && (
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-300">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">✅</span>
                      <span className="font-bold text-green-900">Đúng/Sai</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {formatScore(submission.scoreBreakdown.trueFalse.points)}
                    </div>
                    <div className="text-sm text-green-700 mb-1">
                      Đúng {submission.scoreBreakdown.trueFalse.correct}/{submission.scoreBreakdown.trueFalse.total}
                      {submission.scoreBreakdown.trueFalse.partial > 0 && (
                        <span className="text-yellow-600"> (+{submission.scoreBreakdown.trueFalse.partial} phần điểm)</span>
                      )}
                    </div>
                    {submission.scoreBreakdown.trueFalse.pointsPerQuestion && (
                      <div className="text-xs text-green-600">
                        ({formatScore(submission.scoreBreakdown.trueFalse.pointsPerQuestion)} điểm/câu)
                      </div>
                    )}
                  </div>
                )}

                {/* Short Answer */}
                {submission.scoreBreakdown.shortAnswer.total > 0 && (
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-2 border-orange-300">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">✏️</span>
                      <span className="font-bold text-orange-900">Trả lời ngắn</span>
                    </div>
                    <div className="text-2xl font-bold text-orange-600 mb-1">
                      {formatScore(submission.scoreBreakdown.shortAnswer.points)}
                    </div>
                    <div className="text-sm text-orange-700 mb-1">
                      Đúng {submission.scoreBreakdown.shortAnswer.correct}/{submission.scoreBreakdown.shortAnswer.total}
                    </div>
                    {submission.scoreBreakdown.shortAnswer.pointsPerQuestion && (
                      <div className="text-xs text-orange-600">
                        ({formatScore(submission.scoreBreakdown.shortAnswer.pointsPerQuestion)} điểm/câu)
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Overall Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{submission.correctCount}</div>
              <div className="text-sm text-green-700">Câu đúng</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{submission.wrongCount}</div>
              <div className="text-sm text-red-700">Câu sai</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">
                {formatDuration(submission.duration).split(' ')[0]}
              </div>
              <div className="text-sm text-blue-700">Phút làm bài</div>
            </div>
          </div>

          {/* Student Info */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Họ tên:</span>
                <span className="font-semibold ml-2">{submission.student.name}</span>
              </div>
              {submission.student.className && (
                <div>
                  <span className="text-gray-500">Lớp:</span>
                  <span className="font-semibold ml-2">{submission.student.className}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Mã phòng:</span>
                <span className="font-mono font-semibold ml-2">{submission.roomCode}</span>
              </div>
              <div>
                <span className="text-gray-500">Thời gian:</span>
                <span className="font-semibold ml-2">{formatDuration(submission.duration)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={onExit}
              className="px-8 py-3 rounded-xl font-semibold text-teal-600 border-2 border-teal-300 hover:bg-teal-50 transition"
            >
              ← Về trang chủ
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-8 py-3 rounded-xl font-bold text-white transition"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
              >
                🔄 Làm lại
              </button>
            )}
          </div>
        </div>

        {/* ✅ MỚI: Kiểm tra quyền xem đáp án */}
        {exam && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div
              className="p-4 text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)' }}
            >
              📋 Xem lại bài làm
            </div>

            {/* ✅ Thông báo nếu không được phép xem đáp án */}
            {!canShowCorrectAnswers && !canShowExplanations && (
              <div className="p-8 text-center">
                <div className="text-6xl mb-4">🔒</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Không thể xem đáp án</h3>
                <p className="text-gray-600">
                  Giáo viên chưa cho phép xem đáp án và lời giải cho bài thi này.
                </p>
              </div>
            )}

            {/* ✅ Hiển thị bài làm với các quyền tương ứng */}
            {(canShowCorrectAnswers || canShowExplanations) && (
              <div className="divide-y divide-gray-100">
                {/* ✅ Thông báo giới hạn quyền */}
                {(!canShowCorrectAnswers || !canShowExplanations) && (
                  <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">ℹ️</span>
                      <div className="flex-1">
                        <p className="font-semibold text-yellow-800">Thông báo:</p>
                        <ul className="text-sm text-yellow-700 mt-1 list-disc list-inside">
                          {!canShowCorrectAnswers && <li>Không được phép xem đáp án đúng</li>}
                          {!canShowExplanations && <li>Không được phép xem lời giải chi tiết</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {exam.questions.map((q: Question) => {
                  const userAnswer = submission.answers[q.number];
                  const correctAnswer = q.correctAnswer || '';

                  if (q.type === 'true_false') {
                    return (
                      <TrueFalseReview
                        key={q.number}
                        question={q}
                        userAnswer={userAnswer}
                        correctAnswer={correctAnswer}
                        showCorrectAnswers={canShowCorrectAnswers}
                        showExplanations={canShowExplanations}
                        breakdown={submission.scoreBreakdown?.trueFalse?.details?.[q.number]}
                      />
                    );
                  } else if (q.type === 'short_answer') {
                    return (
                      <ShortAnswerReview
                        key={q.number}
                        question={q}
                        userAnswer={userAnswer}
                        correctAnswer={correctAnswer}
                        showCorrectAnswers={canShowCorrectAnswers}
                        showExplanations={canShowExplanations}
                      />
                    );
                  } else {
                    return (
                      <MultipleChoiceReview
                        key={q.number}
                        question={q}
                        userAnswer={userAnswer}
                        correctAnswer={correctAnswer}
                        showCorrectAnswers={canShowCorrectAnswers}
                        showExplanations={canShowExplanations}
                      />
                    );
                  }
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ===== Review: Multiple choice =====
const MultipleChoiceReview: React.FC<{
  question: Question;
  userAnswer?: string;
  correctAnswer: string;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
}> = ({ question, userAnswer, correctAnswer, showCorrectAnswers, showExplanations }) => {
  const isCorrect = userAnswer?.toUpperCase() === correctAnswer?.toUpperCase();

  return (
    <div className={`p-4 ${showCorrectAnswers ? (isCorrect ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
            showCorrectAnswers
              ? isCorrect
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
              : 'bg-gray-400 text-white'
          }`}
        >
          {question.number % 100}
        </div>
        <div className="flex-1">
          <div className="text-gray-800 mb-2">
            <MathText html={question.text || ''} block />
          </div>

          {question.images && question.images.length > 0 && (
            <div className="my-2 flex flex-wrap justify-center gap-2">
              {question.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : ''}
                  alt={`Hình ${idx + 1}`}
                  className="block mx-auto max-h-32 rounded border"
                />
              ))}
            </div>
          )}

          {question.options && (
            <div className="grid grid-cols-2 gap-2">
              {question.options.map((opt: QuestionOption) => {
                const isUserAnswer = userAnswer?.toUpperCase() === opt.letter.toUpperCase();
                const isCorrectOpt = correctAnswer?.toUpperCase() === opt.letter.toUpperCase();

                let optClass = 'bg-white border-gray-200';
                
                if (showCorrectAnswers) {
                  if (isCorrectOpt) optClass = 'bg-green-100 border-green-500';
                  else if (isUserAnswer) optClass = 'bg-red-100 border-red-500';
                } else {
                  if (isUserAnswer) optClass = 'bg-blue-100 border-blue-500';
                }

                return (
                  <div key={opt.letter} className={`flex items-center gap-2 p-2 rounded-lg border-2 text-sm ${optClass}`}>
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        showCorrectAnswers
                          ? isCorrectOpt
                            ? 'bg-green-500 text-white'
                            : isUserAnswer
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-200'
                          : isUserAnswer
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200'
                      }`}
                    >
                      {opt.letter}
                    </span>
                    <span className="flex-1">
                      <MathText html={opt.text || ''} />
                    </span>
                    {showCorrectAnswers && isCorrectOpt && <span className="text-green-600">✔</span>}
                    {showCorrectAnswers && isUserAnswer && !isCorrect && <span className="text-red-600">✖</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ✅ Hiển thị đáp án của bạn */}
          <div className="mt-3 p-2 bg-blue-50 rounded">
            <span className="text-sm text-blue-700">
              <strong>Bạn chọn:</strong> {userAnswer || '(Chưa chọn)'}
            </span>
          </div>

          {/* ✅ Hiển thị đáp án đúng (nếu được phép) */}
          {showCorrectAnswers && (
            <div className={`mt-2 p-2 rounded ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              <span className={`text-sm font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? '✅ Chính xác!' : `❌ Sai. Đáp án đúng: ${correctAnswer}`}
              </span>
            </div>
          )}

          {/* ✅ Lời giải chi tiết (nếu được phép) */}
          {showExplanations && question.solution && (
            <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold text-sm">💡 Lời giải:</span>
                <div className="flex-1 text-sm text-gray-700">
                  <MathText html={question.solution} block />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== Review: True/False =====
const TrueFalseReview: React.FC<{
  question: Question;
  userAnswer?: string;
  correctAnswer: string;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  breakdown?: { correctCount: number; points: number };
}> = ({ question, userAnswer, correctAnswer, showCorrectAnswers, showExplanations, breakdown }) => {
  let tfUserAnswers: { [key: string]: boolean } = {};
  if (userAnswer) {
    try {
      tfUserAnswers = JSON.parse(userAnswer);
    } catch {
      const selected = userAnswer
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      selected.forEach((letter) => {
        tfUserAnswers[letter] = true;
      });
    }
  }

  const correctStatements = correctAnswer
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let allCorrect = true;
  if (question.options) {
    for (const opt of question.options) {
      const key = opt.letter.toLowerCase();
      const shouldBeTrue = correctStatements.includes(key);
      // ✅ FIX: undefined (không tick) = false = Sai — dùng === true để convert đúng
      const userSelected = tfUserAnswers[key] === true;
      if (userSelected !== shouldBeTrue) {
        allCorrect = false;
        break;
      }
    }
  }

  return (
    <div className={`p-4 ${showCorrectAnswers ? (allCorrect ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
            showCorrectAnswers
              ? allCorrect
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
              : 'bg-gray-400 text-white'
          }`}
        >
          {question.number % 100}
        </div>
        <div className="flex-1">
          <div className="text-gray-800 mb-2">
            <MathText html={question.text || ''} block />
            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Đ/S</span>
          </div>

          {/* ✅ Badge điểm - giống giao diện giáo viên */}
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
              Đúng sai • {formatScore(breakdown?.points ?? 0)}đ
            </span>
            <span className="text-xs text-gray-500">
              {breakdown?.correctCount ?? 0}/4 ý đúng
            </span>
          </div>

          {question.images && question.images.length > 0 && (
            <div className="my-2 flex flex-wrap justify-center gap-2">
              {question.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : ''}
                  alt={`Hình ${idx + 1}`}
                  className="block mx-auto max-h-32 rounded border"
                />
              ))}
            </div>
          )}

          {question.options && (
            <div className="space-y-2">
              {question.options.map((opt: QuestionOption) => {
                const key = opt.letter.toLowerCase();
                const shouldBeTrue = correctStatements.includes(key);
                // ✅ FIX: undefined (không tick) = false = Sai — dùng === true để convert đúng
                const userSelected = tfUserAnswers[key] === true;
                const isCorrectStatement = userSelected === shouldBeTrue;

                return (
                  <div
                    key={opt.letter}
                    className={`flex items-center gap-2 p-2 rounded-lg border-2 text-sm ${
                      showCorrectAnswers
                        ? isCorrectStatement
                          ? 'bg-green-100 border-green-300'
                          : 'bg-red-100 border-red-300'
                        : 'bg-gray-100 border-gray-300'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold">
                      {opt.letter.toLowerCase()}
                    </span>
                    <span className="flex-1">
                      <MathText html={opt.text || ''} />
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          userSelected === true
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-500 text-white'
                        }`}
                      >
                        {/* ✅ FIX: Không tick = Sai (S), không hiển thị "?" nữa */}
                        Bạn: {userSelected ? 'Đ' : 'S'}
                      </span>
                      
                      {/* ✅ Chỉ hiển thị đáp án đúng nếu được phép */}
                      {showCorrectAnswers && (
                        <>
                          <span className={`px-2 py-0.5 rounded ${shouldBeTrue ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                            ĐA: {shouldBeTrue ? 'Đ' : 'S'}
                          </span>
                          {isCorrectStatement ? <span className="text-green-600">✔</span> : <span className="text-red-600">✖</span>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ✅ Lời giải chi tiết (nếu được phép) */}
          {showExplanations && question.solution && (
            <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold text-sm">💡 Lời giải:</span>
                <div className="flex-1 text-sm text-gray-700">
                  <MathText html={question.solution} block />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== Review: Short answer =====
const ShortAnswerReview: React.FC<{
  question: Question;
  userAnswer?: string;
  correctAnswer: string;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
}> = ({ question, userAnswer, correctAnswer, showCorrectAnswers, showExplanations }) => {
  const normalizeAnswer = (ans: string): string =>
    ans.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').trim();

  const isCorrect = normalizeAnswer(userAnswer || '') === normalizeAnswer(correctAnswer);

  const safeUser = escapeHtml(userAnswer || '');
  const safeCorrect = escapeHtml(correctAnswer || '');

  return (
    <div className={`p-4 ${showCorrectAnswers ? (isCorrect ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
            showCorrectAnswers
              ? isCorrect
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
              : 'bg-gray-400 text-white'
          }`}
        >
          {question.number % 100}
        </div>
        <div className="flex-1">
          <div className="text-gray-800 mb-2">
            <MathText html={question.text || ''} block />
            <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">TLN</span>
          </div>

          {question.images && question.images.length > 0 && (
            <div className="my-2 flex flex-wrap justify-center gap-2">
              {question.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : ''}
                  alt={`Hình ${idx + 1}`}
                  className="block mx-auto max-h-32 rounded border"
                />
              ))}
            </div>
          )}

          <div className="text-sm space-y-1">
            <div className={`p-2 rounded ${showCorrectAnswers ? (isCorrect ? 'bg-green-100' : 'bg-red-100') : 'bg-blue-100'}`}>
              <span className="text-gray-600">Bạn trả lời: </span>
              <span className="font-medium">{userAnswer ? <MathText html={safeUser} /> : '(Bỏ trống)'}</span>
              {showCorrectAnswers && (isCorrect ? <span className="ml-2 text-green-600">✔</span> : <span className="ml-2 text-red-600">✖</span>)}
            </div>

            {/* ✅ Chỉ hiển thị đáp án đúng nếu được phép */}
            {showCorrectAnswers && !isCorrect && (
              <div className="p-2 rounded bg-green-100">
                <span className="text-gray-600">Đáp án đúng: </span>
                <span className="font-medium text-green-700">
                  <MathText html={safeCorrect} />
                </span>
              </div>
            )}
          </div>

          {/* ✅ Lời giải chi tiết (nếu được phép) */}
          {showExplanations && question.solution && (
            <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold text-sm">💡 Lời giải:</span>
                <div className="flex-1 text-sm text-gray-700">
                  <MathText html={question.solution} block />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultView;
