import React, { useState, useEffect, useMemo } from 'react';
import { ExamData, Question, QuestionOption, SectionInfo } from '../types';

interface QuizViewProps {
  examData: ExamData;
  onBack: () => void;
  onExportHtml: () => void;
}

const QuizView: React.FC<QuizViewProps> = ({ examData, onBack, onExportHtml }) => {
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: string }>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(examData.timeLimit ? examData.timeLimit * 60 : 2700);
  const [isTimerActive, setIsTimerActive] = useState(true);

  // Timer countdown
  useEffect(() => {
    if (!isTimerActive || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsTimerActive(false);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isTimerActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionNumber: number, answer: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionNumber]: answer
    }));
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    setIsTimerActive(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    setUserAnswers({});
    setIsSubmitted(false);
    setTimeLeft(examData.timeLimit ? examData.timeLimit * 60 : 2700);
    setIsTimerActive(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:]/g, '')
      .trim();
  };

  const calculateScore = () => {
    let correct = 0;
    examData.questions.forEach((q: Question) => {
      const userAnswer = userAnswers[q.number];
      if (!userAnswer || !q.correctAnswer) return;
      
      if (q.type === 'writing') {
        if (normalizeText(userAnswer) === normalizeText(q.correctAnswer)) {
          correct++;
        }
      } else {
        if (userAnswer.toUpperCase() === q.correctAnswer.toUpperCase()) {
          correct++;
        }
      }
    });
    return correct;
  };

  const correctCount = isSubmitted ? calculateScore() : 0;
  const totalQuestions = examData.questions.length;
  const wrongCount = isSubmitted ? totalQuestions - correctCount : 0;
  const scorePercent = isSubmitted ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const answeredCount = Object.keys(userAnswers).filter(k => userAnswers[parseInt(k)]).length;
  const progressPercent = (answeredCount / totalQuestions) * 100;

  // Group questions by section
  const groupedQuestions = useMemo(() => {
    const groups: {
      section: SectionInfo | null;
      part: string | null;
      passage: string | null;
      questions: Question[];
    }[] = [];

    let currentSection: SectionInfo | null = null;
    let currentPart: string | null = null;
    let currentPassage: string | null = null;
    let currentGroup: Question[] = [];
    const printedPassages = new Set<string>();

    examData.questions.forEach((q, idx) => {
      const sectionChanged = JSON.stringify(q.section) !== JSON.stringify(currentSection);
      const partChanged = q.part !== currentPart;

      if (sectionChanged || partChanged) {
        if (currentGroup.length > 0) {
          groups.push({
            section: currentSection,
            part: currentPart,
            passage: currentPassage,
            questions: currentGroup
          });
        }
        currentSection = q.section || null;
        currentPart = q.part || null;
        currentPassage = q.passage && !printedPassages.has(q.passage) ? q.passage : null;
        if (q.passage) printedPassages.add(q.passage);
        currentGroup = [q];
      } else {
        currentGroup.push(q);
      }

      if (idx === examData.questions.length - 1 && currentGroup.length > 0) {
        groups.push({
          section: currentSection,
          part: currentPart,
          passage: currentPassage,
          questions: currentGroup
        });
      }
    });

    return groups;
  }, [examData.questions]);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)' }}>
      {/* CSS for underlined parts */}
      <style>{`
        .underlined-part {
          text-decoration: underline;
          text-decoration-thickness: 2px;
          font-weight: bold;
        }
        .blank {
          display: inline-block;
          min-width: 120px;
          border-bottom: 2px dashed #2dd4bf;
          margin: 0 5px;
        }
      `}</style>

      {/* Header */}
      <div 
        className="text-white p-6 shadow-lg sticky top-0 z-50"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)' }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">{examData.title}</h1>
              <p className="text-teal-100 mt-1">Tổng số câu: {totalQuestions}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onExportHtml}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2"
              >
                📥 Xuất HTML
              </button>
              <button
                onClick={onBack}
                className="bg-white text-teal-600 px-4 py-2 rounded-lg font-semibold hover:bg-teal-50 transition"
              >
                ← Quay lại
              </button>
            </div>
          </div>

          {/* Timer và Score */}
          <div className="bg-white/10 rounded-lg p-4 flex justify-around items-center">
            <div className="text-center">
              <div className="text-sm opacity-90">⏱ Thời gian còn lại</div>
              <div className={`text-3xl font-bold ${timeLeft < 60 ? 'text-red-300 animate-pulse' : ''}`}>
                {formatTime(timeLeft)}
              </div>
            </div>

            {isSubmitted ? (
              <>
                <div className="text-center">
                  <div className="text-sm opacity-90">🎯 Điểm số</div>
                  <div className="text-3xl font-bold text-green-300">
                    {scorePercent}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm opacity-90">✔/✗ Đúng / Sai</div>
                  <div className="text-2xl font-bold">
                    <span className="text-green-300">{correctCount}</span>
                    {' / '}
                    <span className="text-red-300">{wrongCount}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="text-sm opacity-90">📝 Đã trả lời</div>
                <div className="text-3xl font-bold">
                  {answeredCount}/{totalQuestions}
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4 w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ 
                width: `${isSubmitted ? scorePercent : progressPercent}%`,
                background: 'linear-gradient(90deg, #4ade80, #5eead4)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-5xl mx-auto p-6">
        {groupedQuestions.map((group, gIdx) => (
          <div key={gIdx} className="mb-8">
            {/* Section Header */}
            {group.section && (
              <div 
                className="text-white p-5 rounded-t-2xl"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)' }}
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold uppercase">
                    SECTION {group.section.letter}. {group.section.name}
                  </h2>
                  <span className="bg-white/20 px-4 py-1 rounded-full text-sm">
                    {group.section.points}
                  </span>
                </div>
              </div>
            )}

            {/* Part Header */}
            {group.part && (
              <div 
                className="p-4 border-l-4 border-orange-500 italic font-semibold"
                style={{ 
                  background: 'linear-gradient(90deg, #ffedd5, #fff7ed)',
                  color: '#9a3412'
                }}
              >
                {group.part}
              </div>
            )}

            {/* Reading Passage */}
            {group.passage && (
              <div 
                className="p-6 my-4 rounded-xl border-l-4 border-orange-500"
                style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, white 100%)' }}
              >
                {group.passage.split('\n').map((line, i) => (
                  i === 0 ? (
                    <h3 key={i} className="text-orange-700 font-bold text-center text-lg mb-4">{line}</h3>
                  ) : (
                    <p key={i} className="text-teal-900 leading-relaxed">{line}</p>
                  )
                ))}
              </div>
            )}

            {/* Questions in this group */}
            <div className="bg-white rounded-b-2xl shadow-lg overflow-hidden">
              {group.questions.map((question, qIdx) => (
                <QuestionCard
                  key={question.number}
                  question={question}
                  userAnswer={userAnswers[question.number]}
                  onAnswerChange={handleAnswerChange}
                  isSubmitted={isSubmitted}
                  isLast={qIdx === group.questions.length - 1}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Action Buttons */}
        <div className="sticky bottom-6 bg-white rounded-full shadow-2xl p-4 flex justify-center gap-4 border-4 border-teal-600">
          {!isSubmitted ? (
            <button
              onClick={handleSubmit}
              className="px-8 py-3 rounded-full font-bold text-lg text-white transition shadow-lg transform hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
            >
              ✔ Nộp bài
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="px-8 py-3 rounded-full font-bold text-lg text-white transition shadow-lg transform hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
            >
              ↻ Làm lại
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface QuestionCardProps {
  question: Question;
  userAnswer?: string;
  onAnswerChange: (questionNumber: number, answer: string) => void;
  isSubmitted: boolean;
  isLast: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  userAnswer,
  onAnswerChange,
  isSubmitted,
  isLast
}) => {
  const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:]/g, '')
      .trim();
  };

  const isCorrect = question.type === 'writing'
    ? normalizeText(userAnswer || '') === normalizeText(question.correctAnswer || '')
    : userAnswer?.toUpperCase() === question.correctAnswer?.toUpperCase();
  const hasAnswer = !!userAnswer;

  // Check if this is a PHONETICS section
  const isPhonetics = question.section?.name?.toLowerCase().includes('phonetics');

  // Get question stem (text before options)
  const getQuestionStem = (): string => {
    if (!question.text) return '';
    if (question.type === 'multiple_choice') {
      const re = /([A-D])[\.\)]/;
      const m = re.exec(question.text);
      if (m && m.index <= 2) {
        return question.text.slice(0, m.index).trim();
      }
    }
    return question.text;
  };

  // Format question text
  const formatQuestionText = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/_+/g, '<span class="blank"></span>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  };

  let borderClass = 'border-transparent';
  let bgClass = '';
  if (isSubmitted) {
    if (hasAnswer) {
      borderClass = isCorrect ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500';
      bgClass = isCorrect 
        ? 'bg-gradient-to-r from-green-50 to-white' 
        : 'bg-gradient-to-r from-red-50 to-white';
    } else {
      borderClass = 'border-l-4 border-orange-500';
      bgClass = 'bg-gradient-to-r from-orange-50 to-white';
    }
  }

  return (
    <div className={`p-6 border-b border-teal-100 hover:bg-teal-50 transition ${borderClass} ${bgClass} ${isLast ? 'border-b-0' : ''}`}>
      <div className="flex items-start gap-3 mb-4">
        <div 
          className="text-white font-bold rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 shadow-md"
          style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
        >
          {question.number}
        </div>
        <div className="flex-1">
          <p 
            className="text-gray-800 font-medium"
            dangerouslySetInnerHTML={{ __html: formatQuestionText(getQuestionStem()) }}
          />
        </div>
      </div>

      {question.type === 'multiple_choice' && question.options && (
        <div className="grid grid-cols-2 gap-4 ml-12">
          {question.options.map((option: QuestionOption) => {
            const isSelected = userAnswer?.toUpperCase() === option.letter.toUpperCase();
            const isCorrectOption = option.letter.toUpperCase() === question.correctAnswer?.toUpperCase();
            
            let optionBg = 'bg-teal-50 border-teal-200 hover:border-teal-400 hover:bg-teal-100';
            let labelBg = 'bg-teal-500';
            
            if (isSubmitted) {
              if (isCorrectOption) {
                optionBg = 'bg-green-100 border-green-500 shadow-md';
                labelBg = 'bg-green-500';
              } else if (isSelected && !isCorrect) {
                optionBg = 'bg-red-100 border-red-500';
                labelBg = 'bg-red-500';
              }
            } else if (isSelected) {
              optionBg = 'bg-teal-100 border-teal-600 shadow-md';
            }

            // Determine display text
            const displayText = isPhonetics && option.textWithUnderline 
              ? option.textWithUnderline 
              : option.text;

            return (
              <label
                key={option.letter}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${optionBg}`}
              >
                <input
                  type="radio"
                  name={`q${question.number}`}
                  value={option.letter}
                  checked={isSelected}
                  onChange={(e) => onAnswerChange(question.number, e.target.value)}
                  disabled={isSubmitted}
                  className="hidden"
                />
                <span 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${labelBg}`}
                >
                  {option.letter}
                </span>
                <span 
                  className="flex-1 text-teal-800"
                  dangerouslySetInnerHTML={{ __html: displayText }}
                />
                {isSubmitted && isCorrectOption && (
                  <span className="text-green-600 font-bold text-xl">✔</span>
                )}
                {isSubmitted && isSelected && !isCorrect && (
                  <span className="text-red-600 font-bold text-xl">✗</span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {question.type === 'writing' && (
        <div className="ml-12">
          <input
            type="text"
            value={userAnswer || ''}
            onChange={(e) => onAnswerChange(question.number, e.target.value)}
            disabled={isSubmitted}
            placeholder="Nhập câu trả lời..."
            className={`w-full p-4 border-2 rounded-xl text-lg transition ${
              isSubmitted
                ? isCorrect
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-500 bg-red-50'
                : 'border-teal-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none'
            }`}
          />
        </div>
      )}

      {isSubmitted && (
        <div className={`mt-4 ml-12 p-4 rounded-xl font-medium ${
          isCorrect 
            ? 'bg-green-100 text-green-800 border-l-4 border-green-500' 
            : 'bg-red-100 text-red-800 border-l-4 border-red-500'
        }`}>
          {isCorrect ? (
            <span>✔ Chính xác!</span>
          ) : (
            <span>
              ✗ {hasAnswer ? 'Sai.' : 'Chưa trả lời.'} Đáp án đúng: <strong>{question.correctAnswer}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default QuizView;
