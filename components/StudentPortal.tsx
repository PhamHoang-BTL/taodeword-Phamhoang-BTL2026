import React, { useState, useEffect, useCallback } from 'react';
import { User, Role, Room, StudentInfo, Submission } from '../types';
import {
  auth,
  signInStudentWithGoogle,
  signOutUser,
  getRoomByCode,
  getRoomsForStudent,
  getStudentSubmission,
  getCurrentUser,
  getClass,
  ensureSignedIn,
  getStudentAttemptInfo,
  checkCanAttempt,
} from '../services/firebaseService';
import { loginWithStudentAccount } from '../services/studentAccountService';
import StudentHistory from './StudentHistory';

interface StudentPortalProps {
  onJoinRoom: (room: Room, student: StudentInfo, submissionId?: string) => void;
  onBack?: () => void;
  // ✅ MỚI: pre-fill room code nếu truy cập qua link trực tiếp
  initialRoomCode?: string;
}

// ✅ MỚI: Thêm 'password' vào LoginMode
type LoginMode = 'select' | 'google' | 'anonymous' | 'password';
type ActiveTab = 'join' | 'history';
type RoomTab = 'not_attempted' | 'attempted';

interface RoomAttemptInfo {
  roomId: string;
  attemptCount: number;
  maxAttempts: number;
  bestScore: number | null;
  lastSubmission: Submission | null;
}

const StudentPortal: React.FC<StudentPortalProps> = ({ onJoinRoom, onBack, initialRoomCode }) => {
  const [loginMode, setLoginMode] = useState<LoginMode>('select');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('join');
  const [roomTab, setRoomTab] = useState<RoomTab>('not_attempted');

  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [attemptInfoMap, setAttemptInfoMap] = useState<Map<string, RoomAttemptInfo>>(new Map());
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);

  // Room code
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [isJoining, setIsJoining] = useState(false);

  // Anonymous mode
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');

  // ✅ MỚI: Username/Password mode
  const [pwdUsername, setPwdUsername] = useState('');
  const [pwdPassword, setPwdPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Resolved class names
  const [userClassNames, setUserClassNames] = useState<string[]>([]);

  const resolveClassNames = useCallback(async (user: User) => {
    if (!user.classIds || user.classIds.length === 0) return;
    const names: string[] = [];
    for (const classId of user.classIds) {
      const cls = await getClass(classId);
      if (cls) names.push(cls.name);
    }
    setUserClassNames(names);
  }, []);

  const fetchAttemptInfoForRooms = useCallback(async (rooms: Room[], userId: string) => {
    if (rooms.length === 0) return;
    setIsLoadingAttempts(true);
    try {
      const newMap = new Map<string, RoomAttemptInfo>();
      await Promise.all(
        rooms.map(async (room) => {
          try {
            const info = await getStudentAttemptInfo(room.id, userId);
            newMap.set(room.id, {
              roomId: room.id,
              attemptCount: info.attemptCount,
              maxAttempts: room.settings?.maxAttempts ?? 1,
              bestScore: info.bestScore,
              lastSubmission: info.lastSubmission,
            });
          } catch {
            newMap.set(room.id, {
              roomId: room.id, attemptCount: 0,
              maxAttempts: room.settings?.maxAttempts ?? 1,
              bestScore: null, lastSubmission: null,
            });
          }
        })
      );
      setAttemptInfoMap(newMap);
    } finally {
      setIsLoadingAttempts(false);
    }
  }, []);

  const fetchAvailableRooms = useCallback(async (user: User) => {
    if (!user.classIds || user.classIds.length === 0) return;
    setIsLoadingRooms(true);
    try {
      const rooms = await getRoomsForStudent(user.classIds);
      setAvailableRooms(rooms);
      await fetchAttemptInfoForRooms(rooms, user.id);
    } catch (err) {
      console.error('fetchAvailableRooms error:', err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [fetchAttemptInfoForRooms]);

  // Auth listener — chỉ xử lý Google auth
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser && !firebaseUser.isAnonymous) {
        try {
          const user = await getCurrentUser();
          if (user && user.role === Role.STUDENT) {
            setCurrentUser(user);
            await resolveClassNames(user);
            if (user.isApproved) await fetchAvailableRooms(user);
            setLoginMode('google');
          }
        } catch (err) {
          console.error('Auth state error:', err);
        }
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [resolveClassNames, fetchAvailableRooms]);

  // ✅ MỚI: Nếu có initialRoomCode, tự động điền và chuyển sang anonymous nếu chưa đăng nhập
  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
    }
  }, [initialRoomCode]);

  const handleBackToSelect = () => {
    setLoginMode('select');
    setRoomCode(initialRoomCode || '');
    setStudentName('');
    setClassName('');
    setPwdUsername('');
    setPwdPassword('');
    setPwdError('');
  };

  const handleGoogleLogin = async () => {
    try {
      const user = await signInStudentWithGoogle();
      if (user) {
        setCurrentUser(user);
        await resolveClassNames(user);
        if (user.isApproved) await fetchAvailableRooms(user);
        setLoginMode('google');
      }
    } catch {
      alert('Đăng nhập thất bại. Vui lòng thử lại.');
    }
  };

  // ✅ MỚI: Đăng nhập bằng username/password do GV cấp
  const handlePasswordLogin = async () => {
    setPwdError('');
    if (!pwdUsername.trim()) { setPwdError('Vui lòng nhập tên đăng nhập.'); return; }
    if (!pwdPassword.trim()) { setPwdError('Vui lòng nhập mật khẩu.'); return; }

    setIsLoggingIn(true);
    try {
      const user = await loginWithStudentAccount(pwdUsername.trim(), pwdPassword);
      if (!user) {
        setPwdError('Tên đăng nhập hoặc mật khẩu không đúng.');
        return;
      }
      setCurrentUser(user);
      await resolveClassNames(user);
      if (user.isApproved) await fetchAvailableRooms(user);
      setLoginMode('password');
    } catch (err: any) {
      setPwdError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Nếu đăng nhập Google, sign out Firebase
      if (loginMode === 'google') await signOutUser();
      setCurrentUser(null);
      setUserClassNames([]);
      setAvailableRooms([]);
      setAttemptInfoMap(new Map());
      setLoginMode('select');
      setRoomCode(initialRoomCode || '');
      setPwdUsername('');
      setPwdPassword('');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Join room từ danh sách (Google hoặc Password mode)
  const handleJoinRoomDirect = async (room: Room) => {
    if (!currentUser) return;
    setIsJoining(true);
    try {
      let studentClassName: string | undefined = userClassNames[0];
      if (room.classId && currentUser.classIds) {
        const idx = currentUser.classIds.indexOf(room.classId);
        if (idx >= 0 && idx < userClassNames.length) studentClassName = userClassNames[idx];
      }

      const studentInfo: StudentInfo = {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatar: currentUser.avatar,
        className: studentClassName,
      };

      const attemptCheck = await checkCanAttempt(room, currentUser.id);
      if (!attemptCheck.canAttempt) { alert(`⛔ ${attemptCheck.reason}`); return; }

      const existing = await getStudentSubmission(room.id, currentUser.id);
      const inProgressId = existing?.status === 'in_progress' ? existing.id : undefined;
      onJoinRoom(room, studentInfo, inProgressId);
    } catch {
      alert('❌ Có lỗi xảy ra. Vui lòng thử lại!');
    } finally {
      setIsJoining(false);
    }
  };

  // Join room qua mã (Google hoặc Password mode)
  const handleJoinRoomByCode = async () => {
    if (!roomCode.trim()) { alert('⚠️ Vui lòng nhập mã phòng!'); return; }
    if (!currentUser) { alert('⚠️ Vui lòng đăng nhập trước!'); return; }
    if (!currentUser.isApproved) { alert('⚠️ Tài khoản chưa được duyệt!'); return; }

    setIsJoining(true);
    try {
      const room = await getRoomByCode(roomCode.trim().toUpperCase());
      if (!room) { alert('❌ Không tìm thấy phòng thi!'); return; }
      if (room.status === 'closed') { alert('❌ Phòng thi đã đóng!'); return; }

      const now = Date.now();
      if (room.opensAt && now < new Date(room.opensAt).getTime()) {
        alert(`⏳ Phòng thi chưa mở! Phòng sẽ mở lúc ${new Date(room.opensAt).toLocaleTimeString('vi-VN')}`);
        return;
      }

      const attemptCheck = await checkCanAttempt(room, currentUser.id);
      if (!attemptCheck.canAttempt) { alert(`⛔ ${attemptCheck.reason}`); return; }

      const studentInfo: StudentInfo = {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatar: currentUser.avatar,
        className: userClassNames[0],
      };

      const existing = await getStudentSubmission(room.id, currentUser.id);
      const inProgressId = existing?.status === 'in_progress' ? existing.id : undefined;
      onJoinRoom(room, studentInfo, inProgressId);
    } catch {
      alert('❌ Có lỗi xảy ra. Vui lòng thử lại!');
    } finally {
      setIsJoining(false);
    }
  };

  // Join room anonymous
  const handleJoinRoomAnonymous = async () => {
    if (!roomCode.trim()) { alert('⚠️ Vui lòng nhập mã phòng!'); return; }
    if (!studentName.trim()) { alert('⚠️ Vui lòng nhập họ tên!'); return; }

    setIsJoining(true);
    try {
      await ensureSignedIn();
      const room = await getRoomByCode(roomCode.trim().toUpperCase());
      if (!room) { alert('❌ Không tìm thấy phòng thi!'); return; }
      if (room.status === 'closed') { alert('❌ Phòng thi đã đóng!'); return; }
      if (!room.settings?.allowAnonymous && !room.allowAnonymous) {
        alert('❌ Phòng thi này không cho phép thi tự do!'); return;
      }

      const now = Date.now();
      if (room.opensAt && now < new Date(room.opensAt).getTime()) {
        alert(`⏳ Phòng thi chưa mở!`); return;
      }

      const anonId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const studentInfo: StudentInfo = {
        id: anonId,
        name: studentName.trim(),
        className: className.trim() || undefined,
      };
      onJoinRoom(room, studentInfo);
    } catch {
      alert('❌ Có lỗi. Vui lòng thử lại!');
    } finally {
      setIsJoining(false);
    }
  };

  // Phân loại phòng
  const notAttemptedRooms = availableRooms.filter((room) => {
    const info = attemptInfoMap.get(room.id);
    if (!info) return true;
    const max = info.maxAttempts;
    if (max === 0) return true;
    return info.attemptCount < max;
  });

  const attemptedRooms = availableRooms.filter((room) => {
    const info = attemptInfoMap.get(room.id);
    return !!(info && info.attemptCount > 0);
  });

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-500 border-t-transparent mx-auto mb-4" />
          <p className="text-teal-700">Đang kiểm tra...</p>
        </div>
      </div>
    );
  }

  // ── CHỌN PHƯƠNG THỨC ──
  if (loginMode === 'select' && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)' }}>
        <div className="max-w-lg w-full">
          {onBack && (
            <button onClick={onBack} className="mb-6 flex items-center gap-2 text-teal-700 hover:text-teal-900 font-medium transition">
              ← Trang chủ
            </button>
          )}

          <div className="text-center mb-8">
            <div className="text-7xl mb-3">🎓</div>
            <h1 className="text-3xl font-bold text-teal-900 mb-1">Cổng Học Sinh</h1>
            {initialRoomCode && (
              <div className="mt-3 inline-flex items-center gap-2 bg-teal-100 text-teal-800 px-4 py-2 rounded-xl text-sm font-semibold">
                🔑 Phòng thi: <span className="font-mono font-bold text-lg">{initialRoomCode}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* ✅ MỚI: Đăng nhập bằng tài khoản GV cấp */}
            <button onClick={() => setLoginMode('password')}
              className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition transform hover:scale-[1.02] text-left flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>
                🔑
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Đăng nhập tài khoản lớp</h2>
                <p className="text-gray-500 text-sm">Tài khoản do giáo viên cấp từ Excel</p>
              </div>
              <span className="text-purple-400 text-xl">→</span>
            </button>

            {/* Google */}
            <button onClick={() => setLoginMode('google')}
              className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition transform hover:scale-[1.02] text-left flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: 'linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 75%, #EA4335 100%)' }}>
                🔐
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Đăng nhập Google</h2>
                <p className="text-gray-500 text-sm">Tài khoản cá nhân • Lưu kết quả lâu dài</p>
              </div>
              <span className="text-blue-400 text-xl">→</span>
            </button>

            {/* Anonymous */}
            <button onClick={() => setLoginMode('anonymous')}
              className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition transform hover:scale-[1.02] text-left flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
                ✍️
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Thi tự do</h2>
                <p className="text-gray-500 text-sm">Không cần tài khoản • Chỉ cần nhập tên</p>
              </div>
              <span className="text-orange-400 text-xl">→</span>
            </button>
          </div>

          <p className="text-center text-teal-600 mt-6 text-xs">
            💡 Chế độ "Thi tự do" chỉ khả dụng nếu giáo viên bật tính năng này
          </p>
        </div>
      </div>
    );
  }

  // ── ĐĂNG NHẬP TÀI KHOẢN GV CẤP ──
  if (loginMode === 'password' && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)' }}>
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-7">
              <div className="text-6xl mb-3">🔑</div>
              <h1 className="text-2xl font-bold text-gray-900">Đăng nhập tài khoản lớp</h1>
              <p className="text-gray-500 mt-1 text-sm">Tên đăng nhập & mật khẩu do giáo viên cấp</p>
            </div>

            {initialRoomCode && (
              <div className="mb-5 p-3 bg-purple-50 border border-purple-200 rounded-xl text-center">
                <p className="text-xs text-purple-600">Đăng nhập để vào phòng thi</p>
                <p className="font-mono font-bold text-purple-800 text-lg">{initialRoomCode}</p>
              </div>
            )}

            {pwdError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                ❌ {pwdError}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tên đăng nhập</label>
                <input type="text" value={pwdUsername}
                  onChange={(e) => setPwdUsername(e.target.value.toLowerCase().trim())}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()}
                  placeholder="VD: nguyenvanan"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none font-mono text-sm"
                  disabled={isLoggingIn} autoFocus autoComplete="username" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Mật khẩu</label>
                <input type="password" value={pwdPassword}
                  onChange={(e) => setPwdPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()}
                  placeholder="Nhập mật khẩu..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-sm"
                  disabled={isLoggingIn} autoComplete="current-password" />
              </div>
            </div>

            <button onClick={handlePasswordLogin} disabled={isLoggingIn}
              className="w-full py-4 rounded-xl font-bold text-white text-base transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>
              {isLoggingIn ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Đang đăng nhập...
                </>
              ) : '🚀 Đăng nhập'}
            </button>

            <button onClick={handleBackToSelect}
              className="w-full mt-3 py-3 rounded-xl font-medium text-gray-600 hover:bg-gray-100 transition text-sm">
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── THI TỰ DO (ANONYMOUS) ──
  if (loginMode === 'anonymous') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)' }}>
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-3">✍️</div>
              <h1 className="text-2xl font-bold text-gray-900">Thi tự do</h1>
              <p className="text-gray-500 mt-1 text-sm">Nhập thông tin để vào thi</p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Mã phòng thi <span className="text-red-500">*</span>
                </label>
                <input type="text" value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="VD: ABC123"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none font-mono text-xl text-center tracking-widest uppercase"
                  maxLength={6} disabled={isJoining} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input type="text" value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none"
                  disabled={isJoining} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Lớp (tùy chọn)</label>
                <input type="text" value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="VD: 10A1"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none"
                  disabled={isJoining} />
              </div>
            </div>

            <button onClick={handleJoinRoomAnonymous}
              disabled={isJoining || !roomCode.trim() || !studentName.trim()}
              className="w-full py-4 rounded-xl font-bold text-white text-lg transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
              {isJoining
                ? <span className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />Đang kiểm tra...</span>
                : '🚀 Vào Phòng Thi'}
            </button>

            <button onClick={handleBackToSelect}
              className="w-full mt-3 py-3 rounded-xl font-medium text-gray-600 hover:bg-gray-100 transition">
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ĐĂNG NHẬP GOOGLE (chưa có user) ──
  if (loginMode === 'google' && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)' }}>
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="text-6xl mb-3">🔐</div>
              <h1 className="text-2xl font-bold text-gray-900">Đăng nhập học sinh</h1>
              <p className="text-gray-500 mt-1 text-sm">Dùng tài khoản Google để tiếp tục</p>
            </div>
            <button onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-white border-2 border-gray-300 rounded-xl hover:border-teal-500 hover:shadow-lg transition font-semibold text-gray-700">
              <GoogleIcon />
              Đăng nhập với Google
            </button>
            <button onClick={handleBackToSelect}
              className="w-full mt-3 py-3 rounded-xl font-medium text-gray-600 hover:bg-gray-100 transition">
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ĐÃ ĐĂNG NHẬP (Google hoặc Password) ──
  if ((loginMode === 'google' || loginMode === 'password') && currentUser) {
    const hasClass = userClassNames.length > 0;
    const isPasswordMode = loginMode === 'password';

    return (
      <div className="min-h-screen p-4"
        style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #e0f7f3 100%)' }}>
        <div className="max-w-2xl mx-auto">
          {onBack && (
            <button onClick={onBack} className="mb-4 flex items-center gap-2 text-teal-700 hover:text-teal-900 font-medium transition">
              ← Trang chủ
            </button>
          )}

          {/* User info card */}
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {currentUser.avatar
                  ? <img src={currentUser.avatar} alt="" className="w-14 h-14 rounded-full border-2 border-teal-200" />
                  : <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
                      style={{ background: isPasswordMode ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                }
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{currentUser.name}</h2>
                  {hasClass
                    ? <p className="text-sm text-teal-600 mt-0.5">📚 {userClassNames.join(' • ')}</p>
                    : <p className="text-sm text-gray-400 mt-0.5">
                        {isPasswordMode ? '🔑 Tài khoản lớp học' : currentUser.email}
                      </p>
                  }
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {isPasswordMode && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">🔑 TK lớp học</span>
                    )}
                    <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">✓ Đã duyệt</span>
                    {hasClass
                      ? <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">✓ Có lớp</span>
                      : <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">⚠ Chưa có lớp</span>
                    }
                  </div>
                </div>
              </div>
              <button onClick={handleLogout} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">
                Đăng xuất
              </button>
            </div>

            {!hasClass && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-xl text-sm text-yellow-800">
                ⚠️ Bạn chưa được thêm vào lớp nào. Vui lòng liên hệ giáo viên.
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex bg-white rounded-2xl shadow-lg p-1.5 mb-5 gap-1.5">
            <button onClick={() => setActiveTab('join')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
                activeTab === 'join'
                  ? 'text-white shadow'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
              style={activeTab === 'join' ? { background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' } : {}}>
              🏠 Vào thi
            </button>
            <button onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
                activeTab === 'history'
                  ? 'text-white shadow'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
              style={activeTab === 'history' ? { background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' } : {}}>
              📋 Lịch sử bài làm
            </button>
          </div>

          {/* Tab: Vào thi */}
          {activeTab === 'join' && (
            <div className="space-y-4">
              {/* Danh sách phòng */}
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800">📌 Phòng thi của bạn</h2>
                  <button onClick={() => currentUser && fetchAvailableRooms(currentUser)}
                    disabled={isLoadingRooms}
                    className="text-xs text-teal-600 hover:text-teal-800 disabled:opacity-40">
                    {isLoadingRooms ? '⟳' : '↻'} Làm mới
                  </button>
                </div>

                {isLoadingRooms ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-500 border-t-transparent mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Đang tải...</p>
                  </div>
                ) : availableRooms.length === 0 ? (
                  <div className="py-8 text-center text-gray-400">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-sm">Không có phòng thi nào đang mở cho lớp của bạn</p>
                  </div>
                ) : (
                  <>
                    <div className="flex bg-gray-100 rounded-xl p-1 mb-4 gap-1">
                      <button onClick={() => setRoomTab('not_attempted')}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                          roomTab === 'not_attempted' ? 'bg-white shadow text-teal-700' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        🟢 Chưa thi
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${roomTab === 'not_attempted' ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-500'}`}>
                          {notAttemptedRooms.length}
                        </span>
                      </button>
                      <button onClick={() => setRoomTab('attempted')}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                          roomTab === 'attempted' ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        📝 Đã thi
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${roomTab === 'attempted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-500'}`}>
                          {attemptedRooms.length}
                        </span>
                      </button>
                    </div>

                    {roomTab === 'not_attempted' && (
                      <div className="space-y-2">
                        {notAttemptedRooms.length === 0
                          ? <div className="py-6 text-center text-gray-400 text-sm">✅ Bạn đã hoàn thành tất cả!</div>
                          : notAttemptedRooms.map((room) => {
                              const info = attemptInfoMap.get(room.id);
                              return <RoomCard key={room.id} room={room} attemptInfo={info} mode="not_attempted"
                                onJoin={() => handleJoinRoomDirect(room)} disabled={isJoining || isLoadingAttempts} />;
                            })
                        }
                      </div>
                    )}

                    {roomTab === 'attempted' && (
                      <div className="space-y-2">
                        {attemptedRooms.length === 0
                          ? <div className="py-6 text-center text-gray-400 text-sm">📋 Bạn chưa thi ở phòng nào</div>
                          : attemptedRooms.map((room) => {
                              const info = attemptInfoMap.get(room.id);
                              const canRetry = !info || info.maxAttempts === 0 || info.attemptCount < info.maxAttempts;
                              return <RoomCard key={room.id} room={room} attemptInfo={info} mode="attempted"
                                onJoin={canRetry ? () => handleJoinRoomDirect(room) : undefined}
                                disabled={isJoining || isLoadingAttempts} />;
                            })
                        }
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Nhập mã thủ công */}
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h2 className="font-bold text-gray-800 mb-4">🔑 Nhập mã phòng thủ công</h2>
                <input type="text" value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoomByCode()}
                  placeholder="ABC123" maxLength={6}
                  className="w-full px-4 py-4 text-3xl text-center font-mono font-bold border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:ring-4 focus:ring-teal-200 focus:outline-none uppercase tracking-[0.3em] mb-4"
                  disabled={isJoining} />
                <button onClick={handleJoinRoomByCode}
                  disabled={isJoining || !roomCode.trim()}
                  className="w-full py-3 rounded-xl font-bold text-white transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}>
                  {isJoining
                    ? <span className="flex items-center justify-center gap-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />Đang kiểm tra...</span>
                    : '🚀 Vào Phòng Thi'}
                </button>
              </div>
            </div>
          )}

          {/* Tab: Lịch sử */}
          {activeTab === 'history' && <StudentHistory student={currentUser} />}
        </div>
      </div>
    );
  }

  return null;
};

// ─── RoomCard component ───────────────────────────────────────────────────

const RoomCard: React.FC<{
  room: Room;
  attemptInfo?: RoomAttemptInfo;
  mode: 'not_attempted' | 'attempted';
  onJoin?: () => void;
  disabled?: boolean;
}> = ({ room, attemptInfo, mode, onJoin, disabled }) => {
  const statusBadge = room.status === 'active'
    ? { label: '🟢 Đang thi', cls: 'bg-green-100 text-green-700' }
    : { label: '🟡 Chờ mở', cls: 'bg-yellow-100 text-yellow-700' };

  const closesAt = room.closesAt ? new Date(room.closesAt) : null;
  const maxAttempts = attemptInfo?.maxAttempts ?? 1;
  const attemptCount = attemptInfo?.attemptCount ?? 0;
  const bestScore = attemptInfo?.bestScore;
  const lastSub = attemptInfo?.lastSubmission;
  const attemptsLeft = maxAttempts === 0 ? null : maxAttempts - attemptCount;

  return (
    <div className={`border-2 rounded-xl p-4 transition ${
      mode === 'attempted' ? 'border-purple-100 bg-purple-50/30 hover:border-purple-300' : 'border-gray-100 hover:border-teal-300'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-gray-800 truncate">{room.examTitle}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            {maxAttempts > 1 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                attemptsLeft === 0 ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
              }`}>
                {maxAttempts === 0 ? '♾ Không giới hạn' : attemptsLeft === 0 ? `Hết ${maxAttempts} lần` : `Còn ${attemptsLeft}/${maxAttempts} lần`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
            <span>🔑 {room.code}</span>
            <span>⏱ {room.timeLimit} phút</span>
            {room.className && <span>🏫 {room.className}</span>}
            {closesAt && <span>🕐 Đóng: {closesAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>

          {mode === 'attempted' && attemptCount > 0 && (
            <div className="mt-2 p-2 bg-white rounded-lg border border-purple-100 text-xs space-y-0.5">
              <span className="text-purple-700 font-semibold">📝 Đã thi: {attemptCount} lần</span>
              {bestScore != null && (
                <span className="ml-3 text-green-700 font-semibold">🏆 Cao nhất: {(bestScore as number).toFixed(2)}</span>
              )}
              {lastSub?.submittedAt && (
                <div className="text-gray-400">Lần gần nhất: {new Date(lastSub.submittedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {onJoin ? (
            <button onClick={onJoin} disabled={disabled}
              className="px-4 py-2 rounded-xl font-bold text-white text-sm transition disabled:opacity-50"
              style={{ background: mode === 'attempted' ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}>
              {mode === 'attempted' ? '🔄 Thi lại →' : 'Vào thi →'}
            </button>
          ) : (
            <span className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500">Hết lượt</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Google icon ──────────────────────────────────────────────────────────
const GoogleIcon: React.FC = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export default StudentPortal;
