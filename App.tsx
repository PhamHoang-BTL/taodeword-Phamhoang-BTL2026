import React, { useState, useEffect } from 'react';
import StudentPortal from './components/StudentPortal';
import ExamRoom from './components/ExamRoom';
import ResultView from './components/ResultView';
import TeacherDashboard from './components/TeacherDashboard';
import PendingApproval from './components/PendingApproval';
import AdminUserPanel from './components/AdminUserPanel';
import { User, Role, Room, StudentInfo, Submission, Exam } from './types';
import { auth, signInWithGoogle, signOutUser, getCurrentUser, getExam, hasAnyUsers } from './services/firebaseService';

type AppView = 'landing' | 'student-portal' | 'exam-room' | 'result' | 'teacher-dashboard' | 'pending-approval' | 'admin-users';

// ⚠️ Thêm email admin vào đây
const ADMIN_EMAILS: string[] = [];

// Thông tin thương hiệu LMS
const BRAND = {
  name: 'LMS Thầy Phúc',
  tagline: 'Hệ thống học tập & thi trực tuyến',
  primaryColor: '#1e3a5f',
  accentColor: '#f59e0b',
};

function App() {
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentStudent, setCurrentStudent] = useState<StudentInfo | null>(null);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | undefined>();
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [initialRoomCode, setInitialRoomCode] = useState<string | undefined>();

  const isAdmin = currentUser && (
    currentUser.role === Role.ADMIN ||
    currentUser.role === Role.LEADER ||
    currentUser.role === Role.DEPUTY ||
    ADMIN_EMAILS.includes(currentUser.email || '')
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode) {
      setInitialRoomCode(roomCode.trim().toUpperCase());
      setCurrentView('student-portal');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const user = await getCurrentUser();
          if (user) {
            setCurrentUser(user);
            if (user.role === Role.STUDENT) {
              setCurrentView('student-portal');
            } else {
              if (user.isApproved || ADMIN_EMAILS.includes(user.email || '')) {
                setCurrentView('teacher-dashboard');
              } else {
                setCurrentView('pending-approval');
              }
            }
          }
        } catch (err) {
          console.error('Auth error:', err);
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleTeacherLogin = async () => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        setCurrentUser(user);
        if (user.isApproved || ADMIN_EMAILS.includes(user.email || '')) {
          setCurrentView('teacher-dashboard');
        } else {
          setCurrentView('pending-approval');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('Đăng nhập thất bại. Vui lòng thử lại.');
    }
  };

  const handleTeacherLogout = async () => {
    try {
      await signOutUser();
      setCurrentUser(null);
      setCurrentView('landing');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleJoinRoom = async (room: Room, student: StudentInfo, submissionId?: string) => {
    setCurrentRoom(room);
    setCurrentStudent(student);
    setExistingSubmissionId(submissionId);
    const exam = await getExam(room.examId);
    if (exam) setCurrentExam(exam);
    setCurrentView('exam-room');
  };

  const handleSubmitted = (submission: Submission) => {
    setCurrentSubmission(submission);
    setCurrentView('result');
  };

  const handleExit = () => {
    setCurrentRoom(null);
    setCurrentStudent(null);
    setCurrentSubmission(null);
    setCurrentExam(null);
    setExistingSubmissionId(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    setInitialRoomCode(undefined);
    setCurrentView('landing');
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}>
        <div className="text-center text-white">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-white/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-amber-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">📚</div>
          </div>
          <p className="text-xl font-semibold">{BRAND.name}</p>
          <p className="text-blue-300 text-sm mt-1">Đang kết nối...</p>
        </div>
      </div>
    );
  }

  // ── Router ───────────────────────────────────────────────────────────────
  switch (currentView) {
    case 'student-portal':
      return (
        <StudentPortal
          onJoinRoom={handleJoinRoom}
          onBack={() => setCurrentView('landing')}
          initialRoomCode={initialRoomCode}
        />
      );

    case 'exam-room':
      if (!currentRoom || !currentStudent) { setCurrentView('landing'); return null; }
      return (
        <ExamRoom
          room={currentRoom}
          student={currentStudent}
          existingSubmissionId={existingSubmissionId}
          onSubmitted={handleSubmitted}
          onExit={handleExit}
        />
      );

    case 'result':
      if (!currentSubmission || !currentRoom) { setCurrentView('landing'); return null; }
      return (
        <ResultView
          submission={currentSubmission}
          room={currentRoom}
          exam={currentExam || undefined}
          showAnswers={currentRoom.showResultAfterSubmit}
          onExit={handleExit}
        />
      );

    case 'pending-approval':
      if (!currentUser) { setCurrentView('landing'); return null; }
      return <PendingApproval user={currentUser} onLogout={handleTeacherLogout} />;

    case 'admin-users':
      if (!currentUser || !isAdmin) { setCurrentView('teacher-dashboard'); return null; }
      return <AdminUserPanel currentUser={currentUser} onBack={() => setCurrentView('teacher-dashboard')} />;

    case 'teacher-dashboard':
      if (!currentUser) { setCurrentView('landing'); return null; }
      return (
        <div>
          {isAdmin && (
            <div className="fixed bottom-6 right-6 z-50">
              <button
                onClick={() => setCurrentView('admin-users')}
                className="text-white px-4 py-3 rounded-full shadow-2xl transition transform hover:scale-105 flex items-center gap-2 font-semibold"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}
              >
                👥 Quản lý User
              </button>
            </div>
          )}
          <TeacherDashboard user={currentUser} onLogout={handleTeacherLogout} />
        </div>
      );

    // ── Landing Page ────────────────────────────────────────────────────────
    default:
      return (
        <div
          className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #0f2027 0%, #1e3a5f 50%, #2563eb 100%)' }}
        >
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }}
            />
            <div
              className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
            />
            {/* Grid pattern */}
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                backgroundSize: '60px 60px',
              }}
            />
          </div>

          <div className="max-w-md w-full relative z-10">

            {/* ── Brand Header ─────────────────────────────────────────── */}
            <div className="text-center mb-10">
              {/* Logo */}
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-5 shadow-2xl relative"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                <span className="text-5xl">📚</span>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 rounded-full border-2 border-white flex items-center justify-center">
                  <span className="text-xs">✓</span>
                </div>
              </div>

              <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2"
                style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", letterSpacing: '-0.5px' }}>
                {BRAND.name}
              </h1>
              <p className="text-blue-300 text-base">{BRAND.tagline}</p>

              {/* Divider */}
              <div className="flex items-center gap-3 mt-5 justify-center">
                <div className="h-px w-16 bg-white/20" />
                <span className="text-white/40 text-xs uppercase tracking-widest">Chào mừng</span>
                <div className="h-px w-16 bg-white/20" />
              </div>
            </div>

            {/* ── Entry Cards ──────────────────────────────────────────── */}
            <div className="space-y-4">

              {/* Student card */}
              <button
                onClick={() => setCurrentView('student-portal')}
                className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all duration-200 group border border-white/10"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.5)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                  🎓
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">Học sinh</h2>
                  <p className="text-blue-300 text-sm">Đăng nhập để vào phòng thi</p>
                </div>
                <div className="text-amber-400 text-xl font-bold group-hover:translate-x-1 transition-transform">→</div>
              </button>

              {/* Teacher card */}
              <button
                onClick={handleTeacherLogin}
                className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all duration-200 group border border-white/10"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.5)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                  👨‍🏫
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">Giáo viên</h2>
                  <p className="text-blue-300 text-sm">Đăng nhập Google để quản lý lớp học</p>
                </div>
                <div className="text-blue-400 text-xl font-bold group-hover:translate-x-1 transition-transform">→</div>
              </button>
            </div>

            {/* ── Feature Pills ─────────────────────────────────────────── */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {[
                { icon: '🔒', label: 'Giám sát đa thiết bị' },
                { icon: '📊', label: 'Thống kê realtime' },
                { icon: '🤖', label: 'AI tạo đề' },
                { icon: '⚡', label: 'Thi ngay lập tức' },
              ].map((f) => (
                <span
                  key={f.label}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/15 text-white/60"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  {f.icon} {f.label}
                </span>
              ))}
            </div>

            {/* Footer */}
            <p className="text-center text-white/30 mt-8 text-xs">
              {BRAND.name} • Powered by Firebase & Claude AI
            </p>
          </div>
        </div>
      );
  }
}

export default App;
