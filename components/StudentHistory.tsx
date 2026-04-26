import React, { useState, useEffect, useCallback } from 'react';
import { User, Submission, Room, Exam } from '../types';
import {
  getSubmissionsByStudent,
  getSubmissionsByRoom,
  getRoom,
  getExam,
} from '../services/firebaseService';
import ResultView from './ResultView';

interface StudentHistoryProps {
  student: User;
}

interface RankInfo {
  rank: number;
  total: number;
}

// ── Helpers ──
const getGrade = (pct: number) => {
  if (pct >= 90) return { grade: 'A+', color: 'text-green-600', bg: 'bg-green-100', emoji: '🏆', label: 'Xuất sắc' };
  if (pct >= 80) return { grade: 'A',  color: 'text-green-600', bg: 'bg-green-100', emoji: '🌟', label: 'Giỏi' };
  if (pct >= 70) return { grade: 'B+', color: 'text-blue-600',  bg: 'bg-blue-100',  emoji: '👍', label: 'Khá' };
  if (pct >= 60) return { grade: 'B',  color: 'text-blue-600',  bg: 'bg-blue-100',  emoji: '📚', label: 'Trung bình khá' };
  if (pct >= 50) return { grade: 'C',  color: 'text-yellow-600', bg: 'bg-yellow-100', emoji: '💪', label: 'Trung bình' };
  if (pct >= 40) return { grade: 'D',  color: 'text-orange-600', bg: 'bg-orange-100', emoji: '📖', label: 'Yếu' };
  return           { grade: 'F',  color: 'text-red-600',   bg: 'bg-red-100',   emoji: '😞', label: 'Kém' };
};

const getRankLabel = (rank: number) => {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
};

const getRankColor = (rank: number, total: number) => {
  if (rank <= 3)               return 'text-yellow-700 bg-yellow-50 border-yellow-300';
  if (rank / total <= 0.25)    return 'text-green-700 bg-green-50 border-green-300';
  if (rank / total <= 0.5)     return 'text-blue-700 bg-blue-50 border-blue-300';
  if (rank / total <= 0.75)    return 'text-gray-600 bg-gray-50 border-gray-300';
  return                              'text-red-600 bg-red-50 border-red-300';
};

const formatDate = (date?: Date) => {
  if (!date) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}p ${s}s`;
};

interface DetailState {
  submission: Submission;
  room: Room;
  exam: Exam | null;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
const StudentHistory: React.FC<StudentHistoryProps> = ({ student }) => {
  const [submissions, setSubmissions]           = useState<Submission[]>([]);
  const [isLoading, setIsLoading]               = useState(true);
  const [isLoadingDetail, setIsLoadingDetail]   = useState(false);
  const [detail, setDetail]                     = useState<DetailState | null>(null);
  const [error, setError]                       = useState<string | null>(null);

  // roomId → { rank, total }
  const [ranks, setRanks]                 = useState<Map<string, RankInfo>>(new Map());
  const [isLoadingRanks, setIsLoadingRanks] = useState(false);

  // ── Fetch submissions + tính rank ──
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSubmissionsByStudent(student.id);
      setSubmissions(data);

      if (data.length > 0) {
        setIsLoadingRanks(true);
        const uniqueRoomIds = [...new Set(data.map(s => s.roomId))];
        const rankMap = new Map<string, RankInfo>();

        await Promise.allSettled(
          uniqueRoomIds.map(async (roomId) => {
            try {
              const allSubs = await getSubmissionsByRoom(roomId);
              const sorted = [...allSubs].sort(
                (a, b) => (b.percentage || 0) - (a.percentage || 0)
              );
              const idx = sorted.findIndex(s => s.student?.id === student.id);
              if (idx >= 0) {
                rankMap.set(roomId, { rank: idx + 1, total: sorted.length });
              }
            } catch (_) {
              // bỏ qua phòng lỗi
            }
          })
        );

        setRanks(rankMap);
        setIsLoadingRanks(false);
      }
    } catch (err) {
      console.error('StudentHistory fetch error:', err);
      setError('Không tải được lịch sử. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [student.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Mở chi tiết ──
  const handleOpenDetail = useCallback(async (sub: Submission) => {
    setIsLoadingDetail(true);
    try {
      const room = await getRoom(sub.roomId);
      if (!room) { alert('❌ Không tìm thấy thông tin phòng thi!'); return; }
      const exam = await getExam(room.examId);
      setDetail({ submission: sub, room, exam });
    } catch (err) {
      console.error('Load detail error:', err);
      alert('❌ Có lỗi khi tải dữ liệu bài làm!');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  // ── Render ResultView ──
  if (detail) {
    return (
      <ResultView
        submission={detail.submission}
        room={detail.room}
        exam={detail.exam || undefined}
        showAnswers={
          detail.room.settings?.showCorrectAnswers ??
          detail.room.showResultAfterSubmit ??
          true
        }
        onExit={() => setDetail(null)}
      />
    );
  }

  if (isLoadingDetail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-500 border-t-transparent mx-auto mb-4" />
          <p className="text-teal-700 font-medium">Đang tải bài làm...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500 border-t-transparent mx-auto mb-3" />
          <p className="text-teal-600">Đang tải lịch sử...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-red-600 font-medium mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-6 py-2 bg-teal-500 text-white rounded-xl font-semibold hover:bg-teal-600 transition"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-7xl mb-4">📭</div>
        <h3 className="text-xl font-bold text-gray-700 mb-2">Chưa có bài làm nào</h3>
        <p className="text-gray-500 text-sm">Vào thi và nộp bài để kết quả xuất hiện ở đây.</p>
      </div>
    );
  }

  // ── Thống kê tổng ──
  const totalExams = submissions.length;
  const avgPct = Math.round(
    submissions.reduce((sum, s) => sum + (s.percentage || 0), 0) / totalExams
  );
  const bestPct = Math.max(...submissions.map(s => s.percentage || 0));

  const bestRankInfo = (() => {
    let best: RankInfo | null = null;
    for (const sub of submissions) {
      const r = ranks.get(sub.roomId);
      if (!r) continue;
      if (!best || r.rank < best.rank) best = r;
    }
    return best;
  })();

  return (
    <div>
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl shadow p-4 text-center">
          <div className="text-2xl font-bold text-teal-600">{totalExams}</div>
          <div className="text-xs text-gray-500 mt-1">Bài đã làm</div>
        </div>

        <div className="bg-white rounded-xl shadow p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{avgPct}%</div>
          <div className="text-xs text-gray-500 mt-1">Điểm TB</div>
        </div>

        <div className="bg-white rounded-xl shadow p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{bestPct}%</div>
          <div className="text-xs text-gray-500 mt-1">Điểm cao nhất</div>
        </div>

        <div className="bg-white rounded-xl shadow p-4 text-center">
          {isLoadingRanks ? (
            <div className="flex justify-center items-center h-8 mt-1">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-400 border-t-transparent" />
            </div>
          ) : bestRankInfo ? (
            <>
              <div className="text-2xl font-bold text-yellow-600">
                {getRankLabel(bestRankInfo.rank)}
              </div>
              <div className="text-xs text-gray-400">/{bestRankInfo.total} HS</div>
            </>
          ) : (
            <div className="text-2xl font-bold text-gray-300 mt-1">—</div>
          )}
          <div className="text-xs text-gray-500 mt-1">Thứ hạng tốt nhất</div>
        </div>
      </div>

      {/* ── Danh sách bài làm ── */}
      <div className="space-y-3">
        {submissions.map((sub) => {
          const grade    = getGrade(sub.percentage);
          const rankInfo = ranks.get(sub.roomId);

          return (
            <div
              key={sub.id}
              className="bg-white rounded-2xl shadow hover:shadow-md transition cursor-pointer group"
              onClick={() => handleOpenDetail(sub)}
            >
              <div className="p-4 flex items-center gap-4">
                {/* Grade badge */}
                <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${grade.bg}`}>
                  <span className="text-lg">{grade.emoji}</span>
                  <span className={`text-sm font-bold leading-none ${grade.color}`}>{grade.grade}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 truncate group-hover:text-teal-700 transition">
                    {sub.roomCode ? `Phòng ${sub.roomCode}` : 'Bài thi'}
                  </h3>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                    <span>📅 {formatDate(sub.submittedAt)}</span>
                    <span>⏱ {formatDuration(sub.duration)}</span>
                    <span>📝 {sub.correctCount}/{sub.totalQuestions} câu đúng</span>
                  </div>

                  {/* Rank badge */}
                  <div className="mt-2 h-5 flex items-center">
                    {isLoadingRanks ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <span className="animate-spin rounded-full h-3 w-3 border border-gray-300 border-t-transparent" />
                        Đang tải thứ hạng...
                      </span>
                    ) : rankInfo ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${getRankColor(rankInfo.rank, rankInfo.total)}`}>
                        {getRankLabel(rankInfo.rank)} Hạng {rankInfo.rank}/{rankInfo.total} học sinh
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">Chưa có xếp hạng</span>
                    )}
                  </div>
                </div>

                {/* Điểm + mũi tên */}
                <div className="flex-shrink-0 text-right">
                  <div className={`text-2xl font-bold ${grade.color}`}>
                    {sub.percentage}%
                  </div>
                  {sub.totalScore !== undefined && (
                    <div className="text-xs text-gray-400">{sub.totalScore} điểm</div>
                  )}
                </div>
                <div className="text-gray-300 group-hover:text-teal-400 transition text-xl flex-shrink-0">→</div>
              </div>

              {/* Anti-cheat warnings */}
              {(sub.tabSwitchCount > 0 || sub.autoSubmitted) && (
                <div className="px-4 pb-3 flex gap-2 flex-wrap">
                  {sub.tabSwitchCount > 0 && (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      ⚠️ Chuyển tab {sub.tabSwitchCount} lần
                    </span>
                  )}
                  {sub.autoSubmitted && (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      🤖 Tự động nộp bài
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Hiển thị {submissions.length} bài đã nộp • Nhấn vào bài để xem chi tiết
      </p>
    </div>
  );
};

export default StudentHistory;
