/**
 * sessionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Quản lý phiên thi học sinh:
 *   • Đăng ký / heartbeat / xóa session khi thi
 *   • Phát hiện đa thiết bị (2 IP / tab khác nhau cùng 1 tài khoản)
 *   • Ghi nhận vi phạm (chuyển tab, đa thiết bị, auto-submit)
 *   • Subscribe realtime cho giáo viên giám sát
 *
 * Collection Firestore: examSessions
 *   Doc ID: {roomId}_{studentId}
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db, ensureSignedIn, auth } from './firebaseService';   // re-use existing Firestore instance
import type { ExamSession, SessionViolation } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tạo sessionId ngẫu nhiên cho mỗi tab/thiết bị */
export const generateSessionId = (): string => {
  // Cố gắng dùng Crypto API; fallback về Math.random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

/** Rút gọn User-Agent để lưu vào Firestore */
const getDeviceInfo = (): string => {
  const ua = navigator.userAgent;
  if (/mobile/i.test(ua)) return 'Mobile Browser';
  if (/tablet|ipad/i.test(ua)) return 'Tablet Browser';
  return 'Desktop Browser';
};

/** Document ID theo quy ước */
const sessionDocId = (roomId: string, studentId: string) =>
  `${roomId}_${studentId}`;

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Đăng ký phiên thi mới.
 * Ghi đè doc hiện có → thiết bị cũ sẽ bị đá ra (phát hiện qua onSnapshot).
 */
export const registerSession = async (
  roomId: string,
  studentId: string,
  studentName: string,
  sessionId: string,
  className?: string,
  totalQuestions = 0,
  timeRemaining = 0,
): Promise<void> => {
  // ✅ FIX: Đảm bảo auth sẵn sàng trước khi ghi Firestore
  await ensureSignedIn();

  const docRef = doc(db, 'examSessions', sessionDocId(roomId, studentId));
  const session: Omit<ExamSession, 'startedAt' | 'lastHeartbeat'> & {
    startedAt: any;
    lastHeartbeat: any;
  } = {
    sessionId,
    roomId,
    studentId,
    studentName,
    className: className ?? '',
    deviceInfo: getDeviceInfo(),
    startedAt: serverTimestamp(),
    lastHeartbeat: serverTimestamp(),
    tabSwitches: 0,
    violations: [],
    answeredCount: 0,
    totalQuestions,
    timeRemaining,
    status: 'active',
  };
  await setDoc(docRef, session, { merge: false }); // merge:false → ghi đè hoàn toàn
};

/**
 * Heartbeat mỗi 15 giây – cập nhật tiến độ + thời gian còn lại.
 * Nếu sessionId không khớp, thiết bị này đã bị đá → callback onKicked.
 */
export const sendHeartbeat = async (
  roomId: string,
  studentId: string,
  sessionId: string,
  payload: {
    answeredCount: number;
    timeRemaining: number;
    tabSwitches: number;
  },
): Promise<void> => {
  const docRef = doc(db, 'examSessions', sessionDocId(roomId, studentId));
  try {
    await updateDoc(docRef, {
      lastHeartbeat: serverTimestamp(),
      answeredCount: payload.answeredCount,
      timeRemaining: payload.timeRemaining,
      tabSwitches: payload.tabSwitches,
    });
  } catch {
    // ✅ FIX: Nếu doc chưa tồn tại (registration chưa kịp ghi), dùng setDoc merge
    await setDoc(docRef, {
      roomId,
      studentId,
      sessionId,
      lastHeartbeat: serverTimestamp(),
      answeredCount: payload.answeredCount,
      timeRemaining: payload.timeRemaining,
      tabSwitches: payload.tabSwitches,
      status: 'active',
      violations: [],
    }, { merge: true });
  }
};

/** Ghi vi phạm (tab switch, multi-device, ...) */
export const recordViolation = async (
  roomId: string,
  studentId: string,
  violation: SessionViolation,
): Promise<void> => {
  const docRef = doc(db, 'examSessions', sessionDocId(roomId, studentId));
  await updateDoc(docRef, {
    violations: arrayUnion(violation),
    tabSwitches:
      violation.type === 'tab_switch' || violation.type === 'focus_loss'
        ? increment(1)
        : increment(0),
  }).catch(() => {
    // doc có thể chưa tồn tại nếu ghi vi phạm quá sớm, bỏ qua
  });
};

/** Đánh dấu đã nộp bài */
export const markSessionSubmitted = async (
  roomId: string,
  studentId: string,
): Promise<void> => {
  const docRef = doc(db, 'examSessions', sessionDocId(roomId, studentId));
  await updateDoc(docRef, {
    status: 'submitted',
    lastHeartbeat: serverTimestamp(),
  }).catch(() => {});
};

/** Xóa session khi học sinh thoát (hoặc sau khi nộp bài) */
export const clearSession = async (
  roomId: string,
  studentId: string,
): Promise<void> => {
  const docRef = doc(db, 'examSessions', sessionDocId(roomId, studentId));
  await deleteDoc(docRef).catch(() => {});
};

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Subscribe session của chính học sinh đó để phát hiện bị đá (multi-device).
 * Callback `onKicked` được gọi nếu sessionId thay đổi.
 */
export const subscribeOwnSession = (
  roomId: string,
  studentId: string,
  mySessionId: string,
  callbacks: {
    onKicked: (newDeviceInfo: string) => void;
    onError?: (err: Error) => void;
  },
): (() => void) => {
  const docRef = doc(db, 'examSessions', sessionDocId(roomId, studentId));
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as ExamSession;
      if (data.sessionId && data.sessionId !== mySessionId) {
        callbacks.onKicked(data.deviceInfo ?? 'Thiết bị khác');
      }
    },
    (err) => callbacks.onError?.(err),
  );
};

/**
 * Subscribe TẤT CẢ session của một phòng thi (dành cho giáo viên).
 */
export const subscribeRoomSessions = (
  roomId: string,
  callback: (sessions: ExamSession[]) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  const q = query(
    collection(db, 'examSessions'),
    where('roomId', '==', roomId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const sessions: ExamSession[] = snap.docs.map((d) => {
        const raw = d.data();
        return {
          ...raw,
          startedAt:
            raw.startedAt instanceof Timestamp
              ? raw.startedAt.toDate()
              : raw.startedAt,
          lastHeartbeat:
            raw.lastHeartbeat instanceof Timestamp
              ? raw.lastHeartbeat.toDate()
              : raw.lastHeartbeat,
        } as ExamSession;
      });
      callback(sessions);
    },
    (err) => onError?.(err),
  );
};

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';

interface UseExamSessionOptions {
  roomId: string;
  studentId: string;
  studentName: string;
  sessionId: string;
  className?: string;
  totalQuestions: number;
  /** Gọi khi bị đá do đăng nhập trên thiết bị khác */
  onKicked?: (deviceInfo: string) => void;
}

/**
 * Hook React để tích hợp vào ExamRoom.tsx.
 *
 * Cách dùng:
 *   const { reportTabSwitch, reportViolation, updateProgress } = useExamSession({...})
 */
export function useExamSession({
  roomId,
  studentId,
  studentName,
  sessionId,
  className,
  totalQuestions,
  onKicked,
}: UseExamSessionOptions) {
  const tabSwitchRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRemainingRef = useRef(0);
  const answeredCountRef = useRef(0);

  // ✅ FIX: Lưu Firebase UID thực tế sau khi auth hoàn tất.
  // student.id prop có thể là mã học sinh tùy chỉnh, không phải Firebase UID.
  // Firestore rules thường kiểm tra request.auth.uid → nếu dùng sai ID sẽ bị reject.
  const effectiveIdRef = useRef<string>(studentId);

  // Đăng ký session & subscribe
  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const doRegister = async (attempt = 1) => {
      try {
        // Đảm bảo auth trước
        await ensureSignedIn();

        // ✅ Dùng Firebase UID thực tế (auth.currentUser.uid) làm studentId
        // để khớp với Firestore security rules
        const effectiveId = auth.currentUser?.uid ?? studentId;
        effectiveIdRef.current = effectiveId;

        await registerSession(
          roomId,
          effectiveId,       // ← Firebase UID, không phải student.id prop
          studentName,
          sessionId,
          className,
          totalQuestions,
          timeRemainingRef.current,
        );

        if (!mounted) return;

        // Subscribe để phát hiện multi-device
        unsubRef.current = subscribeOwnSession(roomId, effectiveId, sessionId, {
          onKicked: (deviceInfo) => {
            if (mounted) onKicked?.(deviceInfo);
          },
        });

        // ✅ Heartbeat mỗi 5 giây để giám sát realtime
        heartbeatRef.current = setInterval(() => {
          if (!mounted) return;
          sendHeartbeat(roomId, effectiveId, sessionId, {
            answeredCount: answeredCountRef.current,
            timeRemaining: timeRemainingRef.current,
            tabSwitches: tabSwitchRef.current,
          }).catch(() => {});
        }, 5_000);

      } catch (err) {
        // Retry với exponential backoff (tối đa 5 lần: 1s → 2s → 4s → 8s)
        if (mounted && attempt <= 5) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          retryTimer = setTimeout(() => doRegister(attempt + 1), delay);
        }
      }
    };

    doRegister();

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      unsubRef.current?.();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // ✅ Dùng effectiveIdRef để đánh dấu đúng doc
      markSessionSubmitted(roomId, effectiveIdRef.current).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Gọi mỗi khi học sinh chuyển tab */
  const reportTabSwitch = useCallback(() => {
    tabSwitchRef.current += 1;
    const violation: SessionViolation = {
      type: 'tab_switch',
      timestamp: new Date().toISOString(),
      detail: `Lần ${tabSwitchRef.current}`,
    };
    // ✅ Dùng effectiveIdRef.current (Firebase UID thực tế)
    recordViolation(roomId, effectiveIdRef.current, violation).catch(() => {});
  }, [roomId]);

  /** Gọi khi có vi phạm khác */
  const reportViolation = useCallback(
    (v: SessionViolation) => {
      recordViolation(roomId, effectiveIdRef.current, v).catch(() => {});
    },
    [roomId],
  );

  /** Cập nhật tiến độ + thời gian còn lại (gọi từ ExamRoom mỗi giây) */
  const updateProgress = useCallback(
    (answered: number, timeRemaining: number) => {
      answeredCountRef.current = answered;
      timeRemainingRef.current = timeRemaining;
    },
    [],
  );

  /** Đánh dấu đã nộp bài */
  const submitSession = useCallback(() => {
    markSessionSubmitted(roomId, effectiveIdRef.current).catch(() => {});
  }, [roomId]);

  return { reportTabSwitch, reportViolation, updateProgress, submitSession };
}
