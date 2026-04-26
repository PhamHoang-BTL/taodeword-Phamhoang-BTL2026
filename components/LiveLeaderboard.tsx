// src/components/LiveLeaderboard.tsx
// ============================================================
// LIVE LEADERBOARD - Game-style real-time ranking during exam
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Submission } from '../types';
import { subscribeToSubmissions } from '../services/firebaseService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiveLeaderboardProps {
  roomId: string;
  studentId: string;
  studentName: string;
  totalQuestions: number;
  answeredCount: number;
}

interface RankEntry {
  rank: number;
  submission: Submission;
  isMe: boolean;
}

interface Toast {
  id: number;
  text: string;
  emoji: string;
  type: 'up' | 'down' | 'new' | 'submit';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getMedalIcon = (rank: number): string => {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
};

const getRankStyle = (rank: number, isMe: boolean): React.CSSProperties => {
  if (isMe) {
    return {
      background: 'linear-gradient(135deg, rgba(56,189,248,0.25) 0%, rgba(99,102,241,0.25) 100%)',
      border: '2px solid rgba(56,189,248,0.7)',
      boxShadow: '0 0 16px rgba(56,189,248,0.3)',
    };
  }
  if (rank === 1) return {
    background: 'linear-gradient(135deg, rgba(251,191,36,0.25) 0%, rgba(217,119,6,0.15) 100%)',
    border: '2px solid rgba(251,191,36,0.6)',
    boxShadow: '0 0 20px rgba(251,191,36,0.25)',
  };
  if (rank === 2) return {
    background: 'linear-gradient(135deg, rgba(148,163,184,0.2) 0%, rgba(100,116,139,0.1) 100%)',
    border: '1px solid rgba(148,163,184,0.4)',
  };
  if (rank === 3) return {
    background: 'linear-gradient(135deg, rgba(251,146,60,0.2) 0%, rgba(234,88,12,0.1) 100%)',
    border: '1px solid rgba(251,146,60,0.4)',
  };
  return {
    background: 'rgba(30,41,59,0.6)',
    border: '1px solid rgba(71,85,105,0.4)',
  };
};

const getRankBadgeStyle = (rank: number): React.CSSProperties => {
  if (rank === 1) return { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#1c1917', boxShadow: '0 0 12px rgba(251,191,36,0.6)' };
  if (rank === 2) return { background: 'linear-gradient(135deg,#94a3b8,#64748b)', color: '#fff' };
  if (rank === 3) return { background: 'linear-gradient(135deg,#fb923c,#ea580c)', color: '#fff' };
  return { background: 'rgba(71,85,105,0.8)', color: '#cbd5e1' };
};

const formatScore = (s: number): string =>
  Number.isInteger(s) ? s.toFixed(1) : s.toFixed(2).replace(/0+$/, '');

const formatDuration = (secs: number): string => {
  if (!secs) return '--';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}p${s.toString().padStart(2, '0')}s`;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LiveLeaderboard: React.FC<LiveLeaderboardProps> = ({
  roomId,
  studentId,
  studentName,
  totalQuestions,
  answeredCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set());
  const [rankChanged, setRankChanged] = useState<'up' | 'down' | null>(null);

  const prevRankRef = useRef<number | null>(null);
  const prevSubmittedCountRef = useRef<number>(0);
  const toastIdRef = useRef(0);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  // ─── Push a toast notification ──────────────────────────────────────────
  const pushToast = useCallback((text: string, emoji: string, type: Toast['type']) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-3), { id, text, emoji, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // ─── Subscribe to room submissions ──────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToSubmissions(roomId, (subs) => {
      setSubmissions(subs);

      const submitted = subs.filter(s => s.status === 'submitted');

      // Detect new submissions (skip first load)
      if (!isFirstLoadRef.current) {
        for (const sub of submitted) {
          if (!knownIdsRef.current.has(sub.id)) {
            knownIdsRef.current.add(sub.id);
            setNewEntryIds(prev => new Set([...prev, sub.id]));
            setTimeout(() => setNewEntryIds(prev => {
              const next = new Set(prev);
              next.delete(sub.id);
              return next;
            }), 1500);

            if (sub.student.id !== studentId) {
              pushToast(`${sub.student.name} vừa nộp bài!`, '📩', 'new');
            }
          }
        }
      } else {
        // First load: mark all as known
        for (const sub of submitted) knownIdsRef.current.add(sub.id);
        isFirstLoadRef.current = false;
      }

      prevSubmittedCountRef.current = submitted.length;
    });
    return unsub;
  }, [roomId, studentId, pushToast]);

  // ─── Compute rankings ────────────────────────────────────────────────────
  const submitted = submissions.filter(s => s.status === 'submitted');
  const inProgressCount = submissions.filter(
    s => s.status === 'in_progress' && s.student.id !== studentId
  ).length;

  const rankedList: RankEntry[] = [...submitted]
    .sort((a, b) => {
      const scoreDiff = (b.totalScore || 0) - (a.totalScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.duration || 9999999) - (b.duration || 9999999);
    })
    .map((sub, idx) => ({
      rank: idx + 1,
      submission: sub,
      isMe: sub.student.id === studentId,
    }));

  const myEntry = rankedList.find(e => e.isMe);
  const myRank = myEntry ? myEntry.rank : null;
  const totalSubmitted = submitted.length;

  // ─── Detect rank changes ─────────────────────────────────────────────────
  useEffect(() => {
    if (myRank === null) return;
    const prev = prevRankRef.current;
    if (prev !== null && myRank !== prev) {
      const dir = myRank < prev ? 'up' : 'down';
      setRankChanged(dir);
      if (dir === 'up') pushToast(`Bạn lên hạng ${myRank}! 🔥`, '🚀', 'up');
      else pushToast(`Bạn xuống hạng ${myRank}`, '📉', 'down');
      setTimeout(() => setRankChanged(null), 2000);
    }
    prevRankRef.current = myRank;
  }, [myRank, pushToast]);

  // ─── Auto-open briefly on rank change ───────────────────────────────────
  useEffect(() => {
    if (rankChanged === 'up') {
      setIsOpen(true);
      const t = setTimeout(() => setIsOpen(false), 6000);
      return () => clearTimeout(t);
    }
  }, [rankChanged]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── CSS Keyframes ── */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(100%); opacity: 0; }
        }
        @keyframes popIn {
          0%   { transform: scale(0.6) translateY(10px); opacity: 0; }
          70%  { transform: scale(1.08) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes slideUpFade {
          0%   { transform: translateY(20px); opacity: 0; }
          15%  { transform: translateY(0);    opacity: 1; }
          80%  { transform: translateY(0);    opacity: 1; }
          100% { transform: translateY(-10px); opacity: 0; }
        }
        @keyframes rankPulseUp {
          0%,100% { box-shadow: 0 0 0 rgba(34,197,94,0); }
          50%      { box-shadow: 0 0 24px rgba(34,197,94,0.8); }
        }
        @keyframes rankPulseDown {
          0%,100% { box-shadow: 0 0 0 rgba(239,68,68,0); }
          50%      { box-shadow: 0 0 24px rgba(239,68,68,0.8); }
        }
        @keyframes scanline {
          0%   { background-position: 0 0; }
          100% { background-position: 0 100px; }
        }
        @keyframes livePulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%     { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes newRowPop {
          0%   { transform: scaleY(0); opacity: 0; max-height: 0; }
          60%  { transform: scaleY(1.05); opacity: 1; }
          100% { transform: scaleY(1); opacity: 1; max-height: 200px; }
        }
        .lb-row-new {
          animation: newRowPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
          transform-origin: top;
          overflow: hidden;
        }
        .lb-live-dot {
          animation: livePulse 1.2s ease-in-out infinite;
        }
      `}</style>

      {/* ── Toast Notifications ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: '5.5rem',
          right: '1rem',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              animation: 'slideUpFade 4.5s ease forwards',
              background:
                toast.type === 'up'    ? 'linear-gradient(135deg,#16a34a,#15803d)' :
                toast.type === 'down'  ? 'linear-gradient(135deg,#dc2626,#b91c1c)' :
                toast.type === 'new'   ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' :
                                         'linear-gradient(135deg,#7c3aed,#6d28d9)',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '14px',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              maxWidth: '260px',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <span style={{ fontSize: '18px' }}>{toast.emoji}</span>
            {toast.text}
          </div>
        ))}
      </div>

      {/* ── Floating Rank Badge (always visible) ───────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        title="Mở bảng xếp hạng"
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1rem',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: isOpen
            ? 'linear-gradient(135deg,#1e293b,#0f172a)'
            : 'linear-gradient(135deg,#312e81,#1e1b4b)',
          border: myRank === 1
            ? '2px solid #f59e0b'
            : rankChanged === 'up'
            ? '2px solid #22c55e'
            : rankChanged === 'down'
            ? '2px solid #ef4444'
            : '2px solid rgba(99,102,241,0.6)',
          borderRadius: '18px',
          padding: '10px 14px',
          cursor: 'pointer',
          boxShadow: myRank === 1
            ? '0 0 24px rgba(251,191,36,0.5), 0 8px 32px rgba(0,0,0,0.5)'
            : rankChanged === 'up'
            ? '0 0 20px rgba(34,197,94,0.5), 0 8px 32px rgba(0,0,0,0.5)'
            : '0 8px 32px rgba(0,0,0,0.5)',
          animation: rankChanged === 'up' ? 'rankPulseUp 2s ease' : rankChanged === 'down' ? 'rankPulseDown 2s ease' : undefined,
          transition: 'all 0.3s ease',
          minWidth: '80px',
        }}
      >
        {/* Trophy icon */}
        <div style={{ fontSize: '20px', lineHeight: 1, marginBottom: '2px' }}>
          {myRank === 1 ? '👑' : '🏆'}
        </div>

        {/* Rank display */}
        <div style={{
          fontSize: '11px',
          color: 'rgba(148,163,184,0.9)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {myRank ? 'HẠNG' : 'LIVE'}
        </div>
        <div style={{
          fontSize: myRank ? '22px' : '15px',
          fontWeight: 900,
          color: myRank === 1 ? '#fbbf24' : rankChanged === 'up' ? '#4ade80' : '#e2e8f0',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {myRank ? `#${myRank}` : `?`}
        </div>
        <div style={{
          fontSize: '10px',
          color: 'rgba(148,163,184,0.7)',
          marginTop: '2px',
        }}>
          {totalSubmitted}/{totalSubmitted + inProgressCount + 1} bạn
        </div>

        {/* LIVE dot */}
        <div style={{
          position: 'absolute',
          top: '6px',
          right: '8px',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: '#22c55e',
          boxShadow: '0 0 6px #22c55e',
        }} className="lb-live-dot" />
      </button>

      {/* ── Leaderboard Panel ───────────────────────────────────────────────── */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: '320px',
            zIndex: 998,
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.35s cubic-bezier(0.34,1.2,0.64,1)',
            overflowY: 'auto',
            borderLeft: '1px solid rgba(99,102,241,0.3)',
          }}
        >
          {/* Scanline overlay for retro feel */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* ─ Header ─ */}
          <div style={{
            background: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)',
            padding: '16px 16px 14px',
            borderBottom: '1px solid rgba(99,102,241,0.3)',
            position: 'relative',
            flexShrink: 0,
          }}>
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '8px',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: 700,
              }}
            >✕</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '22px' }}>🏆</span>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 900, fontSize: '16px', letterSpacing: '0.08em' }}>
                  BẢNG XẾP HẠNG
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                  CẬP NHẬT REALTIME
                </div>
              </div>
              {/* Live indicator */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#22c55e', boxShadow: '0 0 8px #22c55e',
                }} className="lb-live-dot" />
                <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: 700 }}>LIVE</span>
              </div>
            </div>

            {/* Stats row */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '4px',
            }}>
              <div style={{
                flex: 1,
                background: 'rgba(30,41,59,0.5)',
                borderRadius: '10px',
                padding: '8px',
                textAlign: 'center',
                border: '1px solid rgba(71,85,105,0.4)',
              }}>
                <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '20px' }}>{totalSubmitted}</div>
                <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 600 }}>ĐÃ NỘP</div>
              </div>
              <div style={{
                flex: 1,
                background: 'rgba(30,41,59,0.5)',
                borderRadius: '10px',
                padding: '8px',
                textAlign: 'center',
                border: '1px solid rgba(71,85,105,0.4)',
              }}>
                <div style={{ color: '#38bdf8', fontWeight: 900, fontSize: '20px' }}>{inProgressCount + (myRank ? 0 : 1)}</div>
                <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 600 }}>ĐANG THI</div>
              </div>
              <div style={{
                flex: 1,
                background: 'rgba(30,41,59,0.5)',
                borderRadius: '10px',
                padding: '8px',
                textAlign: 'center',
                border: '1px solid rgba(71,85,105,0.4)',
              }}>
                <div style={{
                  color: myRank ? (myRank <= 3 ? '#fbbf24' : '#e2e8f0') : '#94a3b8',
                  fontWeight: 900,
                  fontSize: '20px',
                }}>
                  {myRank ? `#${myRank}` : '?'}
                </div>
                <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 600 }}>HẠNG BẠN</div>
              </div>
            </div>
          </div>

          {/* ─ Rankings List ─ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px', position: 'relative', zIndex: 2 }}>
            {rankedList.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 20px',
                color: '#475569',
              }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏳</div>
                <div style={{ fontWeight: 700, color: '#64748b', fontSize: '14px' }}>
                  Chưa có bạn nào nộp bài
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                  Hãy là người đầu tiên! 🚀
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {rankedList.map((entry) => {
                  const isNew = newEntryIds.has(entry.submission.id);
                  const medal = getMedalIcon(entry.rank);
                  const nameShort = entry.submission.student.name.length > 16
                    ? entry.submission.student.name.slice(0, 15) + '…'
                    : entry.submission.student.name;

                  return (
                    <div
                      key={entry.submission.id}
                      className={isNew ? 'lb-row-new' : undefined}
                      style={{
                        ...getRankStyle(entry.rank, entry.isMe),
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.4s ease',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Shimmer for rank 1 */}
                      {entry.rank === 1 && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.15) 50%, transparent 100%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 2.5s infinite',
                          pointerEvents: 'none',
                          borderRadius: '10px',
                        }} />
                      )}

                      {/* Rank Badge */}
                      <div style={{
                        ...getRankBadgeStyle(entry.rank),
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: entry.rank <= 3 ? '18px' : '13px',
                        flexShrink: 0,
                      }}>
                        {medal || entry.rank}
                      </div>

                      {/* Name & Class */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: entry.isMe ? '#7dd3fc' : entry.rank === 1 ? '#fcd34d' : '#e2e8f0',
                          fontWeight: entry.isMe || entry.rank <= 3 ? 800 : 600,
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}>
                          {nameShort}
                          {entry.isMe && (
                            <span style={{
                              background: 'rgba(56,189,248,0.25)',
                              border: '1px solid rgba(56,189,248,0.5)',
                              color: '#38bdf8',
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '5px',
                              letterSpacing: '0.05em',
                            }}>BẠN</span>
                          )}
                          {isNew && (
                            <span style={{
                              background: 'rgba(34,197,94,0.3)',
                              border: '1px solid rgba(34,197,94,0.6)',
                              color: '#4ade80',
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '5px',
                              animation: 'popIn 0.4s ease',
                            }}>MỚI</span>
                          )}
                        </div>
                        <div style={{ color: '#475569', fontSize: '10px', marginTop: '1px' }}>
                          ⏱ {formatDuration(entry.submission.duration)}
                          {entry.submission.student.className && ` • ${entry.submission.student.className}`}
                        </div>
                      </div>

                      {/* Score */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          color: entry.rank === 1 ? '#fbbf24' : entry.isMe ? '#38bdf8' : '#e2e8f0',
                          fontWeight: 900,
                          fontSize: '16px',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatScore(entry.submission.totalScore || 0)}
                        </div>
                        <div style={{ color: '#475569', fontSize: '10px' }}>
                          {entry.submission.correctCount}/{entry.submission.totalQuestions} đúng
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─ In Progress Section ─ */}
          {(inProgressCount > 0 || !myRank) && (
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid rgba(71,85,105,0.3)',
              flexShrink: 0,
              position: 'relative',
              zIndex: 2,
            }}>
              {/* Bạn đang làm (không phải mình) */}
              {inProgressCount > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'rgba(30,41,59,0.6)',
                  borderRadius: '10px',
                  border: '1px solid rgba(71,85,105,0.3)',
                  marginBottom: !myRank ? '6px' : 0,
                }}>
                  <div style={{ fontSize: '14px' }}>🟡</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                      {inProgressCount} bạn đang thi
                    </div>
                  </div>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: '#fbbf24', boxShadow: '0 0 6px #fbbf24',
                  }} className="lb-live-dot" />
                </div>
              )}

              {/* Mình đang làm (chưa nộp) */}
              {!myRank && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(99,102,241,0.15) 100%)',
                  borderRadius: '10px',
                  border: '2px solid rgba(56,189,248,0.4)',
                  boxShadow: '0 0 16px rgba(56,189,248,0.15)',
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: 'rgba(56,189,248,0.2)',
                    border: '1px solid rgba(56,189,248,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', flexShrink: 0,
                  }}>✍️</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#7dd3fc', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {studentName.length > 14 ? studentName.slice(0, 13) + '…' : studentName}
                      <span style={{
                        background: 'rgba(56,189,248,0.3)',
                        border: '1px solid rgba(56,189,248,0.6)',
                        color: '#38bdf8',
                        fontSize: '9px', fontWeight: 800,
                        padding: '1px 5px', borderRadius: '5px',
                      }}>BẠN</span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ marginTop: '5px' }}>
                      <div style={{
                        height: '4px',
                        background: 'rgba(71,85,105,0.5)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%`,
                          background: 'linear-gradient(90deg,#38bdf8,#818cf8)',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease',
                          boxShadow: '0 0 6px rgba(56,189,248,0.6)',
                        }} />
                      </div>
                      <div style={{ color: '#475569', fontSize: '10px', marginTop: '2px' }}>
                        {answeredCount}/{totalQuestions} câu • Đang làm
                      </div>
                    </div>
                  </div>
                  <div style={{ color: '#475569', fontSize: '12px', textAlign: 'right' }}>
                    <div style={{ color: '#38bdf8', fontWeight: 900, fontSize: '15px' }}>?</div>
                    <div style={{ fontSize: '9px' }}>chưa nộp</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─ Footer tip ─ */}
          <div style={{
            padding: '8px 12px 14px',
            textAlign: 'center',
            color: '#334155',
            fontSize: '10px',
            flexShrink: 0,
            position: 'relative',
            zIndex: 2,
          }}>
            💡 Điểm được sắp xếp theo điểm → thời gian nộp
          </div>
        </div>
      )}
    </>
  );
};

export default LiveLeaderboard;
