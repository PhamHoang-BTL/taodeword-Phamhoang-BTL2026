/**
 * LiveMonitoringPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Cửa sổ giám sát trực tiếp phòng thi cho Giáo viên.
 *
 * Hiển thị realtime:
 *   • Danh sách học sinh đang thi
 *   • Thời gian còn lại từng em
 *   • Số câu đã trả lời
 *   • Số lần chuyển tab
 *   • Cảnh báo đa thiết bị
 *   • Trạng thái kết nối (heartbeat)
 *
 * Props:
 *   roomId      – ID phòng thi
 *   roomCode    – Mã phòng (hiển thị)
 *   examTitle   – Tên đề thi
 *   timeLimit   – Thời gian thi (phút)
 *   onClose     – Đóng panel
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../services/firebaseService';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import type { ExamSession, SessionViolation } from '../types';

interface Props {
  roomId: string;
  roomCode: string;
  examTitle: string;
  timeLimit: number;   // phút
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtTime = (seconds: number): string => {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const secondsAgo = (date: Date | null | undefined): number => {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
};

const heartbeatStatus = (
  lastHeartbeat: Date | null,
  status: ExamSession['status'],
): 'online' | 'idle' | 'offline' | 'submitted' => {
  if (status === 'submitted') return 'submitted';
  const ago = secondsAgo(lastHeartbeat);
  if (ago < 25) return 'online';
  if (ago < 60) return 'idle';
  return 'offline';
};

const ViolationBadge: React.FC<{ v: SessionViolation }> = ({ v }) => {
  const colors: Record<string, string> = {
    tab_switch: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    focus_loss: 'bg-orange-100 text-orange-800 border-orange-300',
    multi_device: 'bg-red-100 text-red-800 border-red-300',
    auto_submit: 'bg-purple-100 text-purple-800 border-purple-300',
  };
  const labels: Record<string, string> = {
    tab_switch: '🔀 Chuyển tab',
    focus_loss: '👁️ Mất focus',
    multi_device: '📱 Đa thiết bị',
    auto_submit: '⚡ Auto submit',
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[v.type] ?? 'bg-gray-100 text-gray-700 border-gray-300'}`}
      title={`${new Date(v.timestamp).toLocaleTimeString('vi-VN')}${v.detail ? ' – ' + v.detail : ''}`}
    >
      {labels[v.type] ?? v.type}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LiveMonitoringPanel: React.FC<Props> = ({
  roomId,
  roomCode,
  examTitle,
  timeLimit,
  onClose,
}) => {
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'active' | 'violation' | 'submitted'>('all');
  const [search, setSearch] = useState('');
  const [tick, setTick] = useState(0);

  // ✅ FIX: Subscribe submissions collection (có Firestore rules) thay vì examSessions
  // Học sinh ghi heartbeat 5s/lần vào submission → giáo viên thấy realtime
  useEffect(() => {
    const q = query(
      collection(db, 'submissions'),
      where('roomId', '==', roomId),
    );

    const unsub = onSnapshot(q, (snap) => {
      const mapped: ExamSession[] = snap.docs.map((d) => {
        const data = d.data();

        // Chuyển Timestamp → Date an toàn
        const toDate = (v: any): Date | null => {
          if (!v) return null;
          if (v instanceof Timestamp) return v.toDate();
          if (v instanceof Date) return v;
          return new Date(v);
        };

        return {
          sessionId:    d.id,
          roomId:       data.roomId       ?? '',
          studentId:    data.student?.id  ?? '',
          studentName:  data.student?.name ?? '(không tên)',
          className:    data.student?.className ?? '',
          deviceInfo:   data.deviceInfo   ?? 'Browser',
          startedAt:    toDate(data.startedAt) ?? new Date(),
          lastHeartbeat: toDate(data.lastHeartbeat),
          tabSwitches:  data.liveTabSwitches ?? data.tabSwitchCount ?? 0,
          violations:   data.violations   ?? [],
          answeredCount: data.answeredCount ?? 0,
          totalQuestions: data.totalQuestions ?? 0,
          timeRemaining: data.timeRemaining  ?? 0,
          // HS đang thi = status in_progress + có heartbeat gần đây
          status: data.status === 'completed' ? 'submitted' : 'active',
        } as ExamSession;
      });

      setSessions(mapped);
      setLastUpdate(new Date());
    });

    return () => unsub();
  }, [roomId]);

  // Tick mỗi giây để làm mới "thời gian còn lại" và heartbeat status
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    return sessions
      .filter((s) => {
        if (search) {
          const q = search.toLowerCase();
          return (
            s.studentName.toLowerCase().includes(q) ||
            s.className?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .filter((s) => {
        if (filter === 'all') return true;
        if (filter === 'active') return s.status === 'active';
        if (filter === 'submitted') return s.status === 'submitted';
        if (filter === 'violation') return s.violations.length > 0;
        return true;
      })
      .sort((a, b) => b.violations.length - a.violations.length);
  }, [sessions, filter, search, tick]);

  const stats = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'active').length;
    const submitted = sessions.filter((s) => s.status === 'submitted').length;
    const violated = sessions.filter((s) => s.violations.length > 0).length;
    const multiDevice = sessions.filter((s) =>
      s.violations.some((v) => v.type === 'multi_device'),
    ).length;
    return { active, submitted, violated, multiDevice, total: sessions.length };
  }, [sessions, tick]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-4 text-white"
          style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">
              🖥️
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">
                Giám sát trực tiếp
              </h2>
              <p className="text-blue-200 text-sm">
                Phòng <span className="font-mono font-bold">{roomCode}</span>
                {' · '}
                {examTitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="text-blue-200">Cập nhật lúc</p>
              <p className="font-mono font-semibold">
                {lastUpdate.toLocaleTimeString('vi-VN')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-xl transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Stats Bar ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-gray-50 border-b">
          {[
            {
              label: 'Đang thi',
              value: stats.active,
              color: 'text-blue-700',
              bg: 'bg-blue-50 border-blue-200',
              icon: '✏️',
            },
            {
              label: 'Đã nộp',
              value: stats.submitted,
              color: 'text-green-700',
              bg: 'bg-green-50 border-green-200',
              icon: '✅',
            },
            {
              label: 'Có vi phạm',
              value: stats.violated,
              color: 'text-yellow-700',
              bg: 'bg-yellow-50 border-yellow-200',
              icon: '⚠️',
            },
            {
              label: 'Đa thiết bị',
              value: stats.multiDevice,
              color: 'text-red-700',
              bg: 'bg-red-50 border-red-200',
              icon: '📱',
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-3 flex items-center gap-3 ${s.bg}`}
            >
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter + Search ────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b bg-white">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(
              [
                { key: 'all', label: 'Tất cả' },
                { key: 'active', label: 'Đang thi' },
                { key: 'violation', label: 'Vi phạm' },
                { key: 'submitted', label: 'Đã nộp' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  filter === f.key
                    ? 'bg-white shadow text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Tìm tên / lớp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto border border-gray-200 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <span className="text-sm text-gray-400">{filtered.length} học sinh</span>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="overflow-auto flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <span className="text-5xl mb-3">🎓</span>
              <p className="text-lg">Chưa có học sinh nào vào phòng</p>
              <p className="text-sm mt-1">Dữ liệu sẽ xuất hiện khi học sinh bắt đầu thi</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b z-10">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Học sinh
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    ⏱ Còn lại
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    📝 Câu đã TL
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    🔀 Chuyển tab
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Vi phạm
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Thiết bị
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => {
                  const hb = heartbeatStatus(
                    s.lastHeartbeat instanceof Date
                      ? s.lastHeartbeat
                      : s.lastHeartbeat?.toDate?.() ?? null,
                    s.status,
                  );
                  const hasMultiDevice = s.violations.some(
                    (v) => v.type === 'multi_device',
                  );
                  const rowBg = hasMultiDevice
                    ? 'bg-red-50'
                    : s.violations.length > 0
                    ? 'bg-yellow-50'
                    : '';

                  return (
                    <tr key={s.studentId} className={`hover:bg-blue-50/30 transition ${rowBg}`}>
                      {/* Học sinh */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              hb === 'online'
                                ? 'bg-green-400 animate-pulse'
                                : hb === 'idle'
                                ? 'bg-yellow-400'
                                : hb === 'submitted'
                                ? 'bg-blue-400'
                                : 'bg-gray-300'
                            }`}
                          />
                          <div>
                            <p className="font-semibold text-gray-900">
                              {s.studentName}
                            </p>
                            {s.className && (
                              <p className="text-xs text-gray-400">{s.className}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3">
                        {hb === 'submitted' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            ✅ Đã nộp
                          </span>
                        ) : hb === 'online' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            🟢 Đang thi
                          </span>
                        ) : hb === 'idle' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            🟡 Chờ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            ⚫ Offline
                          </span>
                        )}
                      </td>

                      {/* Thời gian còn lại */}
                      <td className="px-4 py-3 text-center">
                        {s.status === 'submitted' ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span
                            className={`font-mono font-bold text-base ${
                              s.timeRemaining <= 300
                                ? 'text-red-600'
                                : s.timeRemaining <= 600
                                ? 'text-orange-500'
                                : 'text-gray-700'
                            }`}
                          >
                            {fmtTime(s.timeRemaining)}
                          </span>
                        )}
                      </td>

                      {/* Câu đã trả lời */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold text-gray-700">
                            {s.answeredCount}/{s.totalQuestions}
                          </span>
                          {s.totalQuestions > 0 && (
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{
                                  width: `${(s.answeredCount / s.totalQuestions) * 100}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Chuyển tab */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-bold text-lg ${
                            s.tabSwitches >= 3
                              ? 'text-red-600'
                              : s.tabSwitches >= 1
                              ? 'text-yellow-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {s.tabSwitches}
                        </span>
                      </td>

                      {/* Vi phạm */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.violations.length === 0 ? (
                            <span className="text-xs text-gray-400">Không có</span>
                          ) : (
                            <>
                              {/* Chỉ hiện 3 vi phạm cuối */}
                              {s.violations.slice(-3).map((v, i) => (
                                <ViolationBadge key={i} v={v} />
                              ))}
                              {s.violations.length > 3 && (
                                <span className="text-xs text-gray-400">
                                  +{s.violations.length - 3}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Thiết bị */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs text-gray-500">{s.deviceInfo}</span>
                          {hasMultiDevice && (
                            <span className="text-xs font-bold text-red-600 animate-pulse">
                              📱 ĐA TB!
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
          <span>
            🟢 Dữ liệu cập nhật realtime qua Firestore • Heartbeat mỗi 5 giây
          </span>
          <span>
            Tổng: {stats.total} học sinh • {stats.active} đang thi •{' '}
            {stats.submitted} đã nộp
          </span>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitoringPanel;
