// src/components/TeacherDashboard.tsx

import React, { useEffect, useState } from 'react';
import { User, Exam, Room, Submission, Class, ExamData, ExamPointsConfig, Question } from '../types';
import {
  createExam,
  getExamsByTeacher,
  deleteExam,
  createRoom,
  getRoomsByTeacher,
  updateRoomStatus,
  deleteRoom,
  subscribeToSubmissions,
  getExam,
  // ✅ Class management
  createClass,
  getClassesByTeacher,
  getStudentsInClass,
  deleteClass,
  removeStudentFromClass
} from '../services/firebaseService';

import { parseWordToExam, validateExamData } from '../services/mathWordParserService';
import SubmissionDetailView from './SubmissionDetailView';
import PointsConfigEditor from './PointsConfigEditor';
import { formatScore, createDefaultPointsConfig } from '../services/scoringService';
import { exportSubmissionsToExcel } from '../services/excelExportService';

// ✅ NEW: Ngân hàng câu hỏi
import QuestionBankTab from './QuestionBankTab';

// ✅ MỚI: Tài khoản học sinh & Kiến thức
import StudentAccountManager from './StudentAccountManager';
import KnowledgeTab from './KnowledgeTab';
import { saveBankQuestion, type BankQuestionType } from '../services/questionBankService';

// ✅ MỚI: Live monitoring panel
import LiveMonitoringPanel from './LiveMonitoringPanel';

// ✅ MỚI: Xuất đề Word
import { exportExamOnly, exportExamWithAnswers } from '../services/examWordExportService';

interface TeacherDashboardProps {
  user: User;
  onLogout: () => void;
}

// ✅ Thêm 'accounts' và 'knowledge' vào Tab type
type Tab = 'exams' | 'rooms' | 'results' | 'classes' | 'bank' | 'accounts' | 'knowledge';

type PendingUploadMeta = {
  title: string;
  timeLimit: number;
  total: number;
  mc: number;
  tf: number;
  sa: number;
  img: number;
};

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<Tab>('exams');
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // ✅ CÁCH A: Upload -> Parse -> Open PointsConfigEditor -> Save -> createExam(pointsConfig)
  const [showPointsConfig, setShowPointsConfig] = useState(false);
  const [pendingExamData, setPendingExamData] = useState<ExamData | null>(null);
  const [pendingPointsConfig, setPendingPointsConfig] = useState<ExamPointsConfig | null>(null);
  const [pendingMeta, setPendingMeta] = useState<PendingUploadMeta | null>(null);

  // Room creation modal
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [selectedExamForRoom, setSelectedExamForRoom] = useState<Exam | null>(null);
  const [roomTimeLimit, setRoomTimeLimit] = useState(45);
  const [selectedClassForRoom, setSelectedClassForRoom] = useState<string>('');
  const [allowAnonymous, setAllowAnonymous] = useState(false);

  // ✅ MỚI: Số lần thi tối đa (0 = không giới hạn)
  const [maxAttempts, setMaxAttempts] = useState(1);

  // ✅ Schedule open/close
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [roomOpensAt, setRoomOpensAt] = useState<string>('');
  const [roomClosesAt, setRoomClosesAt] = useState<string>('');

  // ✅ Cấu hình xem đáp án và lời giải
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [showExplanations, setShowExplanations] = useState(true);

  // Class management
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [classStudents, setClassStudents] = useState<User[]>([]);

  // Results view
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);

  // ✅ MỚI: Live monitoring
  const [monitoringRoom, setMonitoringRoom] = useState<Room | null>(null);

  // ✅ MỚI: Export Word loading
  const [exportingExamId, setExportingExamId] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Subscribe to submissions when a room is selected
  useEffect(() => {
    if (!selectedRoom) return;

    const unsubscribe = subscribeToSubmissions(selectedRoom.id, (subs) => {
      setSubmissions(subs);
    });

    loadExamForRoom(selectedRoom.examId);

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom?.id]);

  // Load students when class is selected
  useEffect(() => {
    if (!selectedClass) return;
    loadClassStudents(selectedClass.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass?.id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [examsList, roomsList, classesList] = await Promise.all([
        getExamsByTeacher(user.id),
        getRoomsByTeacher(user.id),
        getClassesByTeacher(user.id)
      ]);
      setExams(examsList);
      setRooms(roomsList);
      setClasses(classesList);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadExamForRoom = async (examId: string) => {
    try {
      const exam = await getExam(examId);
      setCurrentExam(exam);
    } catch (err) {
      console.error('Load exam error:', err);
    }
  };

  const loadClassStudents = async (classId: string) => {
    try {
      const students = await getStudentsInClass(classId);
      setClassStudents(students);
    } catch (err) {
      console.error('Load students error:', err);
    }
  };

  // ✅ Reset pending upload state
  const resetPendingUpload = () => {
    setShowPointsConfig(false);
    setPendingExamData(null);
    setPendingPointsConfig(null);
    setPendingMeta(null);
  };

  // ✅ Reset room creation modal
  const resetRoomModal = () => {
    setShowCreateRoom(false);
    setSelectedExamForRoom(null);
    setSelectedClassForRoom('');
    setAllowAnonymous(false);
    setScheduleEnabled(false);
    setRoomOpensAt('');
    setRoomClosesAt('');
    setShowCorrectAnswers(true);
    setShowExplanations(true);
    setMaxAttempts(1); // ✅ MỚI
  };

  // ✅ FINAL STEP: createExam(..., pointsConfig)
  const finalizeCreateExam = async (config: ExamPointsConfig) => {
    if (!pendingExamData || !pendingMeta) return;

    setIsUploading(true);
    try {
      await createExam({
        title: pendingMeta.title,
        description: `${pendingMeta.total} câu hỏi • Môn Toán`,
        timeLimit: pendingMeta.timeLimit || 90,
        questions: pendingExamData.questions,
        sections: pendingExamData.sections,
        answers: pendingExamData.answers,
        createdBy: user.id,
        images: pendingExamData.images || [],
        pointsConfig: config
      });

      alert(
        `✅ Đã tạo đề thi thành công!\n\n` +
          `📊 Thống kê:\n` +
          `• Tổng: ${pendingMeta.total} câu hỏi\n` +
          `• Trắc nghiệm: ${pendingMeta.mc} câu\n` +
          `• Đúng/Sai: ${pendingMeta.tf} câu\n` +
          `• Trả lời ngắn: ${pendingMeta.sa} câu\n` +
          `• Hình ảnh: ${pendingMeta.img} ảnh\n\n` +
          `⚙️ Cấu hình điểm:\n` +
          config.sections
            .map((s) => `• ${s.sectionName}: ${s.totalPoints} điểm (${s.pointsPerQuestion}/câu)`)
            .join('\n')
      );

      resetPendingUpload();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await loadData();
    } catch (err) {
      console.error('Create exam (with pointsConfig) error:', err);
      alert('❌ Lỗi khi tạo đề thi.\n\n' + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      alert('⚠️ Vui lòng chọn file Word (.docx)');
      return;
    }

    setIsUploading(true);
    try {
      const examData = await parseWordToExam(file);
      const validation = validateExamData(examData);

      if (!validation.valid && examData.questions.length === 0) {
        alert('❌ File không hợp lệ:\n' + validation.errors.join('\n'));
        return;
      }

      if (validation.errors.length > 0) {
        console.warn('⚠️ Warnings:', validation.errors);
      }

      const mcCount = examData.questions.filter((q) => q.type === 'multiple_choice').length;
      const tfCount = examData.questions.filter((q) => q.type === 'true_false').length;
      const saCount = examData.questions.filter((q) => q.type === 'short_answer').length;
      const imgCount = examData.images?.length || 0;

      const defaultConfig = createDefaultPointsConfig(examData.questions);

      setPendingExamData(examData);
      setPendingPointsConfig(defaultConfig);
      setPendingMeta({
        title: file.name.replace('.docx', ''),
        timeLimit: examData.timeLimit || 90,
        total: examData.questions.length,
        mc: mcCount,
        tf: tfCount,
        sa: saCount,
        img: imgCount
      });

      setShowPointsConfig(true);
    } catch (err) {
      console.error('Upload error:', err);
      alert('❌ Lỗi khi tải lên. Vui lòng thử lại.\n\n' + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  // ✅ NEW: Tạo đề từ ngân hàng câu hỏi — cùng flow với upload file
  const handleCreateExamFromBank = (
    examData: ExamData,
    meta: { title: string; timeLimit: number }
  ) => {
    const mcCount = examData.questions.filter((q) => q.type === 'multiple_choice').length;
    const tfCount = examData.questions.filter((q) => q.type === 'true_false').length;
    const saCount = examData.questions.filter((q) => q.type === 'short_answer').length;
    const imgCount = examData.images?.length || 0;

    const defaultConfig = createDefaultPointsConfig(examData.questions);

    setPendingExamData(examData);
    setPendingPointsConfig(defaultConfig);
    setPendingMeta({
      title: meta.title,
      timeLimit: meta.timeLimit,
      total: examData.questions.length,
      mc: mcCount,
      tf: tfCount,
      sa: saCount,
      img: imgCount,
    });

    setShowPointsConfig(true);
    setActiveTab('exams');
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      alert('⚠️ Vui lòng nhập tên lớp!');
      return;
    }

    try {
      await createClass({
        name: newClassName,
        grade: newClassGrade,
        subject: 'Toán',
        teacherId: user.id,
        teacherName: user.name
      });

      alert(`✅ Đã tạo lớp "${newClassName}" thành công!`);
      setShowCreateClass(false);
      setNewClassName('');
      setNewClassGrade('');
      loadData();
    } catch (err) {
      console.error('Create class error:', err);
      alert('❌ Lỗi khi tạo lớp');
    }
  };

  const handleDeleteClass = async (classId: string, className: string) => {
    if (!confirm(`Bạn có chắc muốn xóa lớp "${className}"? Tất cả học sinh sẽ bị xóa khỏi lớp.`)) return;

    try {
      await deleteClass(classId);
      alert('✅ Đã xóa lớp!');
      if (selectedClass?.id === classId) {
        setSelectedClass(null);
        setClassStudents([]);
      }
      loadData();
    } catch (err) {
      console.error('Delete class error:', err);
      alert('❌ Lỗi khi xóa lớp');
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedExamForRoom) return;

    try {
      const selectedClassData = selectedClassForRoom
        ? classes.find((c) => c.id === selectedClassForRoom) || null
        : null;

      let opensAtDate: Date | null = null;
      let closesAtDate: Date | null = null;

      if (scheduleEnabled) {
        if (!roomOpensAt) {
          alert('⚠️ Bạn đã bật hẹn giờ nhưng chưa chọn Giờ mở.');
          return;
        }
        opensAtDate = new Date(roomOpensAt);

        if (roomClosesAt) {
          closesAtDate = new Date(roomClosesAt);
        } else {
          closesAtDate = new Date(opensAtDate.getTime() + roomTimeLimit * 60 * 1000);
        }

        if (closesAtDate.getTime() <= opensAtDate.getTime()) {
          alert('⚠️ Giờ đóng phải sau giờ mở.');
          return;
        }
      }

      const newRoom = await createRoom({
        examId: selectedExamForRoom.id,
        examTitle: selectedExamForRoom.title,
        teacherId: user.id,
        teacherName: user.name,
        timeLimit: roomTimeLimit,
        classId: selectedClassData?.id,
        className: selectedClassData?.name,
        opensAt: opensAtDate,
        closesAt: closesAtDate,
        settings: {
          allowLateJoin: true,
          showResultAfterSubmit: true,
          shuffleQuestions: false,
          maxAttempts: maxAttempts, // ✅ MỚI
          allowAnonymous: allowAnonymous,
          showCorrectAnswers: showCorrectAnswers,
          showExplanations: showExplanations
        }
      });

      const scheduleText =
        newRoom.opensAt || newRoom.closesAt
          ? `\n⏰ Lịch:\n${newRoom.opensAt ? `• Mở: ${newRoom.opensAt.toLocaleString()}\n` : ''}${
              newRoom.closesAt ? `• Đóng: ${newRoom.closesAt.toLocaleString()}\n` : ''
            }`
          : '';

      const settingsText =
        `\n⚙️ Cấu hình:\n` +
        `${showCorrectAnswers ? '✅ Cho xem đáp án\n' : '❌ Không cho xem đáp án\n'}` +
        `${showExplanations ? '✅ Cho xem lời giải\n' : '❌ Không cho xem lời giải\n'}` +
        `${maxAttempts === 0 ? '🔄 Không giới hạn số lần thi\n' : `🔄 Tối đa ${maxAttempts} lần thi\n`}`; // ✅ MỚI

      // ✅ MỚI: Thêm link trực tiếp vào thông báo
      const directLink = `${window.location.origin}${window.location.pathname}?room=${newRoom.code}`;

      alert(
        `✅ Đã tạo phòng thi!\n\n` +
          `Mã phòng: ${newRoom.code}\n` +
          `${selectedClassData ? `Lớp: ${selectedClassData.name}\n` : ''}` +
          scheduleText +
          settingsText +
          `\n🔗 Link trực tiếp:\n${directLink}\n\n` +
          `Chia sẻ MÃ PHÒNG hoặc LINK cho học sinh.`
      );

      resetRoomModal();
      loadData();
    } catch (err) {
      console.error('Create room error:', err);
      alert('❌ Lỗi khi tạo phòng thi');
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!confirm('Bạn có chắc muốn xóa đề thi này?')) return;

    try {
      await deleteExam(examId);
      loadData();
    } catch (err) {
      console.error('Delete exam error:', err);
      alert('❌ Lỗi khi xóa đề thi');
    }
  };

  const handleRoomAction = async (roomId: string, action: 'start' | 'close' | 'delete') => {
    try {
      if (action === 'delete') {
        if (!confirm('Bạn có chắc muốn xóa phòng thi này? Tất cả bài làm sẽ bị xóa.')) return;
        await deleteRoom(roomId);

        if (selectedRoom?.id === roomId) {
          setSelectedRoom(null);
          setSubmissions([]);
          setSelectedSubmission(null);
          setCurrentExam(null);
        }
      } else {
        await updateRoomStatus(roomId, action === 'start' ? 'active' : 'closed');
      }
      loadData();
    } catch (err) {
      console.error('Room action error:', err);
      alert('❌ Lỗi thao tác phòng thi');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('✅ Đã copy mã phòng: ' + text);
  };

  // ✅ MỚI: Copy link trực tiếp cho học sinh
  const copyRoomLink = (code: string) => {
    const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(`✅ Đã copy link phòng thi!\n\n${link}\n\nHọc sinh click link này để vào phòng ngay (không cần nhập mã).`);
    });
  };

  const getQuestionTypeCounts = (exam: Exam) => {
    const mc = exam.questions.filter((q) => q.type === 'multiple_choice').length;
    const tf = exam.questions.filter((q) => q.type === 'true_false').length;
    const sa = exam.questions.filter((q) => q.type === 'short_answer').length;
    return { mc, tf, sa };
  };

  // ✅ MỚI: Lưu câu hỏi từ KnowledgeTab vào ngân hàng
  const handleAddQuestionsToBank = async (questions: Question[]) => {
    try {
      let saved = 0;
      for (const q of questions) {
        await saveBankQuestion({
          text: q.text,
          type: q.type as BankQuestionType,
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          solution: q.solution || '',
          tfStatements: q.tfStatements,
          grade: '10',
          subject: 'Chung',
          topic: 'AI Tạo',
          level: 'Thông hiểu',
          createdBy: user.id,
          tags: ['ai-generated'],
        } as any);
        saved++;
      }
      alert(`✅ Đã lưu ${saved} câu vào ngân hàng câu hỏi!`);
    } catch (err: any) {
      alert('❌ Lỗi khi lưu: ' + err.message);
    }
  };

  // ✅ MỚI: Xuất đề thi ra Word
  const handleExportExamWord = async (exam: Exam, withAnswers: boolean) => {
    setExportingExamId(exam.id);
    try {
      if (withAnswers) {
        await exportExamWithAnswers(exam, user.name, 'LMS Thầy Phúc');
      } else {
        await exportExamOnly(exam, user.name, 'LMS Thầy Phúc');
      }
    } catch (err) {
      alert('❌ Lỗi xuất Word: ' + (err as Error).message + '\n\nHãy chắc chắn đã cài: npm install docx');
    } finally {
      setExportingExamId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div
        className="text-white p-4 shadow-lg"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)' }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-3xl">👨‍🏫</div>
            <div>
              <h1 className="text-xl font-bold">LMS Thầy Phúc</h1>
              <p className="text-teal-100 text-sm">{user.name}</p>
            </div>
          </div>
          <button onClick={onLogout} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition">
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { id: 'exams' as Tab,     label: '📚 Đề thi',        count: exams.length },
            { id: 'rooms' as Tab,     label: '🏠 Phòng thi',     count: rooms.length },
            { id: 'results' as Tab,   label: '📊 Kết quả',       count: rooms.filter((r) => r.submittedCount > 0).length },
            { id: 'classes' as Tab,   label: '👥 Lớp học',       count: classes.length },
            { id: 'bank' as Tab,      label: '🗄️ Ngân hàng',    count: null },
            // ✅ MỚI: 2 tab mới
            { id: 'accounts' as Tab,  label: '🔑 Tài khoản HS',  count: null },
            { id: 'knowledge' as Tab, label: '🧠 Kiến thức',     count: null },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== 'results') {
                  setSelectedSubmission(null);
                }
              }}
              className={`px-6 py-3 rounded-xl font-semibold transition ${
                activeTab === tab.id
                  ? tab.id === 'bank'
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : tab.id === 'accounts'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : tab.id === 'knowledge'
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'bg-teal-600 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count !== undefined && (
                <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Đang tải...</p>
          </div>
        ) : (
          <>
            {/* ─────────── Tab: Exams ─────────── */}
            {activeTab === 'exams' && (
              <div>
                <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
                  <h3 className="font-bold text-gray-800 mb-4">📤 Tải lên đề thi mới (Môn Toán)</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Hỗ trợ file Word (.docx) với công thức LaTeX ($...$) và 3 loại câu hỏi: Trắc nghiệm, Đúng/Sai, Trả lời ngắn
                  </p>
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                    id="upload-exam"
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="upload-exam"
                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold cursor-pointer transition ${
                      isUploading ? 'bg-gray-300 cursor-not-allowed' : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Đang xử lý...
                      </>
                    ) : (
                      <>📂 Chọn file Word (.docx)</>
                    )}
                  </label>
                </div>

                <div className="grid gap-4">
                  {exams.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center">
                      <div className="text-6xl mb-4">📝</div>
                      <p className="text-gray-500">Chưa có đề thi nào. Hãy tải lên đề thi đầu tiên!</p>
                    </div>
                  ) : (
                    exams.map((exam) => {
                      const counts = getQuestionTypeCounts(exam);
                      const isExporting = exportingExamId === exam.id;
                      return (
                        <div key={exam.id} className="bg-white rounded-xl p-5 shadow-md hover:shadow-lg transition">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center text-2xl">
                                📄
                              </div>
                              <div>
                                <h3 className="font-bold text-gray-800">{exam.title}</h3>
                                <p className="text-sm text-gray-500">
                                  {exam.questions.length} câu • {exam.timeLimit} phút
                                </p>
                                <div className="flex gap-2 mt-1">
                                  {counts.mc > 0 && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                      TN: {counts.mc}
                                    </span>
                                  )}
                                  {counts.tf > 0 && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                      Đ/S: {counts.tf}
                                    </span>
                                  )}
                                  {counts.sa > 0 && (
                                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                                      TLN: {counts.sa}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                              {/* Hàng 1: actions gốc */}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedExamForRoom(exam);
                                    setShowCreateRoom(true);
                                  }}
                                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition text-sm font-medium"
                                >
                                  🏠 Tạo phòng
                                </button>
                                <button
                                  onClick={() => handleDeleteExam(exam.id)}
                                  className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition text-sm font-medium"
                                >
                                  🗑️
                                </button>
                              </div>
                              {/* ✅ MỚI: Hàng 2 - Xuất Word */}
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleExportExamWord(exam, false)}
                                  disabled={isExporting}
                                  title="Xuất đề (không có đáp án)"
                                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition border border-indigo-200 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {isExporting ? <span className="animate-pulse">⏳</span> : '📝'} Xuất đề Word
                                </button>
                                <button
                                  onClick={() => handleExportExamWord(exam, true)}
                                  disabled={isExporting}
                                  title="Xuất đề kèm đáp án (dành cho GV)"
                                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold transition border border-amber-200 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {isExporting ? <span className="animate-pulse">⏳</span> : '🔑'} + Đáp án
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ─────────── Tab: Rooms ─────────── */}
            {activeTab === 'rooms' && (
              <div className="grid gap-4">
                {rooms.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center">
                    <div className="text-6xl mb-4">🏠</div>
                    <p className="text-gray-500">Chưa có phòng thi nào. Tạo phòng từ đề thi!</p>
                  </div>
                ) : (
                  rooms.map((room) => (
                    <div key={room.id} className="bg-white rounded-xl p-5 shadow-md">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                              room.status === 'active'
                                ? 'bg-green-100'
                                : room.status === 'closed'
                                ? 'bg-gray-100'
                                : 'bg-yellow-100'
                            }`}
                          >
                            {room.status === 'active' ? '🟢' : room.status === 'closed' ? '🔴' : '🟡'}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-800">{room.examTitle}</h3>
                            <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                              <span
                                className="font-mono font-bold text-lg text-teal-600 cursor-pointer hover:text-teal-800"
                                onClick={() => copyToClipboard(room.code)}
                                title="Click để copy mã phòng"
                              >
                                📋 {room.code}
                              </span>

                              {/* ✅ MỚI: Nút copy link trực tiếp */}
                              <button
                                onClick={() => copyRoomLink(room.code)}
                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs rounded-lg font-medium transition border border-indigo-200"
                                title="Copy link trực tiếp cho học sinh"
                              >
                                🔗 Link
                              </button>

                              {room.className && (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                    {room.className}
                                  </span>
                                </>
                              )}

                              <span>•</span>
                              <span>{room.timeLimit} phút</span>

                              <span>•</span>
                              <span>
                                {room.submittedCount}/{room.totalStudents} đã nộp
                              </span>

                              {/* ✅ MỚI: Badge số lần thi */}
                              {room.settings && room.settings.maxAttempts !== undefined && (
                                <>
                                  <span>•</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    room.settings.maxAttempts === 0
                                      ? 'bg-orange-100 text-orange-700'
                                      : room.settings.maxAttempts > 1
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {room.settings.maxAttempts === 0
                                      ? '🔄 Không giới hạn lần'
                                      : room.settings.maxAttempts === 1
                                      ? '1 lần thi'
                                      : `🔄 ${room.settings.maxAttempts} lần thi`}
                                  </span>
                                </>
                              )}

                              {(room.opensAt || room.closesAt) && (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                                    ⏰ {room.opensAt ? `Mở: ${room.opensAt.toLocaleString()}` : 'Mở: -'}{' '}
                                    {room.closesAt ? `• Đóng: ${room.closesAt.toLocaleString()}` : ''}
                                  </span>
                                </>
                              )}

                              {room.settings && (
                                <>
                                  <span>•</span>
                                  <div className="flex gap-1">
                                    {room.settings.showCorrectAnswers && (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium" title="Cho xem đáp án">
                                        ✅
                                      </span>
                                    )}
                                    {room.settings.showExplanations && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium" title="Cho xem lời giải">
                                        📖
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              room.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : room.status === 'closed'
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {room.status === 'active' ? 'Đang thi' : room.status === 'closed' ? 'Đã đóng' : 'Chờ bắt đầu'}
                          </span>

                          {room.status === 'waiting' && (
                            <button
                              onClick={() => handleRoomAction(room.id, 'start')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
                            >
                              ▶️ Bắt đầu
                            </button>
                          )}
                          {room.status === 'active' && (
                            <>
                              {/* ✅ MỚI: Nút giám sát trực tiếp */}
                              <button
                                onClick={() => setMonitoringRoom(room)}
                                className="px-4 py-2 text-white rounded-lg transition text-sm font-semibold hover:opacity-90"
                                style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}
                              >
                                🖥️ Giám sát
                              </button>
                              <button
                                onClick={() => handleRoomAction(room.id, 'close')}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
                              >
                                ⏹️ Đóng phòng
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              setSelectedRoom(room);
                              setActiveTab('results');
                            }}
                            className="px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
                          >
                            📊 Kết quả
                          </button>
                          <button
                            onClick={() => handleRoomAction(room.id, 'delete')}
                            className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition text-sm font-medium"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─────────── Tab: Results ─────────── */}
            {activeTab === 'results' && (
              <div>
                <div className="bg-white rounded-xl p-4 mb-6 shadow-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Chọn phòng thi:</label>
                  <select
                    value={selectedRoom?.id || ''}
                    onChange={(e) => {
                      const room = rooms.find((r) => r.id === e.target.value) || null;
                      setSelectedRoom(room);
                      setSelectedSubmission(null);
                      if (!room) {
                        setSubmissions([]);
                        setCurrentExam(null);
                      }
                    }}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">-- Chọn phòng --</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.code} - {room.examTitle} ({room.submittedCount} bài nộp)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRoom && submissions.length > 0 && (
                  <div className="flex gap-3 mb-6 flex-wrap">
                    <button
                      onClick={() => exportSubmissionsToExcel(submissions, selectedRoom)}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition flex items-center gap-2"
                    >
                      📊 Xuất Excel
                    </button>
                    {/* ✅ MỚI: Mở monitoring từ tab kết quả */}
                    {selectedRoom.status === 'active' && (
                      <button
                        onClick={() => setMonitoringRoom(selectedRoom)}
                        className="px-6 py-3 text-white rounded-xl font-semibold transition flex items-center gap-2 hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}
                      >
                        🖥️ Giám sát trực tiếp
                      </button>
                    )}
                  </div>
                )}

                {selectedRoom && (
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="p-4 bg-teal-600 text-white">
                      <h3 className="font-bold">📊 Kết quả: {selectedRoom.examTitle}</h3>
                      <p className="text-sm text-teal-100">
                        Mã phòng: {selectedRoom.code} • {submissions.length} bài nộp
                        {selectedRoom.settings?.maxAttempts !== undefined && (
                          <span className="ml-2 px-2 py-0.5 bg-white/20 rounded text-xs">
                            {selectedRoom.settings.maxAttempts === 0
                              ? '🔄 Không giới hạn lần'
                              : `🔄 Tối đa ${selectedRoom.settings.maxAttempts} lần`}
                          </span>
                        )}
                      </p>
                    </div>

                    {submissions.length === 0 ? (
                      <div className="p-12 text-center">
                        <div className="text-5xl mb-4">🔭</div>
                        <p className="text-gray-500">Chưa có học sinh nào nộp bài</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">STT</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Họ tên</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Lớp</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Điểm</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Phần trăm</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Đúng/Tổng</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Thời gian</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Hành động</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {submissions.map((sub, idx) => (
                              <tr key={sub.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm">{idx + 1}</td>
                                <td className="px-4 py-3 font-medium">
                                  {sub.student.name}
                                  {sub.tabSwitchCount > 0 && (
                                    <span className="ml-2 text-xs text-red-600" title="Có chuyển tab">
                                      ⚠️{sub.tabSwitchCount}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">{sub.student.className || '-'}</td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`font-bold text-lg ${
                                      sub.totalScore >= 8
                                        ? 'text-green-600'
                                        : sub.totalScore >= 5
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {formatScore(sub.totalScore)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center text-sm">
                                  <span className="font-semibold">{sub.percentage}%</span>
                                </td>
                                <td className="px-4 py-3 text-center text-sm">
                                  <span className="text-green-600 font-medium">{sub.correctCount}</span>
                                  <span className="text-gray-400">/{sub.totalQuestions}</span>
                                </td>
                                <td className="px-4 py-3 text-center text-sm text-gray-600">
                                  {Math.floor(sub.duration / 60)}:{(sub.duration % 60).toString().padStart(2, '0')}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => setSelectedSubmission(sub)}
                                    className="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 text-sm font-medium"
                                  >
                                    👁️ Chi tiết
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {submissions.length > 0 && (
                      <div className="p-4 bg-gray-50 border-t">
                        <div className="grid grid-cols-4 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-teal-600">{submissions.length}</div>
                            <div className="text-sm text-gray-500">Tổng bài nộp</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-600">
                              {formatScore(submissions.reduce((acc, s) => acc + s.totalScore, 0) / submissions.length)}
                            </div>
                            <div className="text-sm text-gray-500">Điểm TB</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-blue-600">
                              {formatScore(Math.max(...submissions.map((s) => s.totalScore)))}
                            </div>
                            <div className="text-sm text-gray-500">Cao nhất</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-orange-600">
                              {formatScore(Math.min(...submissions.map((s) => s.totalScore)))}
                            </div>
                            <div className="text-sm text-gray-500">Thấp nhất</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─────────── Tab: Classes ─────────── */}
            {activeTab === 'classes' && (
              <div>
                <div className="mb-6">
                  <button
                    onClick={() => setShowCreateClass(true)}
                    className="px-6 py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition"
                  >
                    ➕ Tạo lớp mới
                  </button>
                </div>

                <div className="grid gap-4">
                  {classes.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center">
                      <div className="text-6xl mb-4">👥</div>
                      <p className="text-gray-500">Chưa có lớp học nào. Hãy tạo lớp đầu tiên!</p>
                    </div>
                  ) : (
                    classes.map((cls) => (
                      <div key={cls.id} className="bg-white rounded-xl p-5 shadow-md hover:shadow-lg transition">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl">
                              🎓
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-800 text-lg">{cls.name}</h3>
                              <p className="text-sm text-gray-500">
                                {cls.grade && `Khối ${cls.grade} • `}
                                {cls.totalStudents} học sinh
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedClass(cls)}
                              className="px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
                            >
                              👥 Xem học sinh
                            </button>
                            <button
                              onClick={() => handleDeleteClass(cls.id, cls.name)}
                              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition text-sm font-medium"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ─────────── Tab: Ngân hàng câu hỏi ─────────── */}
            {activeTab === 'bank' && (
              <QuestionBankTab
                user={user}
                classes={classes}
                onCreateExam={handleCreateExamFromBank}
              />
            )}

            {/* ─────────── Tab: Tài khoản Học sinh ─────────── */}
            {activeTab === 'accounts' && (
              <StudentAccountManager teacher={user} classes={classes} />
            )}

            {/* ─────────── Tab: Kiến thức & Câu hỏi ─────────── */}
            {activeTab === 'knowledge' && (
              <KnowledgeTab
                teacher={user}
                classes={classes}
                onAddQuestionsToBank={handleAddQuestionsToBank}
              />
            )}
          </>
        )}
      </div>

      {/* ═══ MODAL: PointsConfigEditor ═══ */}
      {showPointsConfig && pendingPointsConfig && pendingMeta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl">
            <div className="mb-3 bg-white/90 rounded-xl p-4 border border-orange-200">
              <div className="font-bold text-gray-800">📌 Đề: {pendingMeta.title}</div>
              <div className="text-sm text-gray-600 mt-1">
                Tổng {pendingMeta.total} câu • TN {pendingMeta.mc} • Đ/S {pendingMeta.tf} • TLN {pendingMeta.sa}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Nhập "tổng điểm" cho từng phần (ví dụ TN=3 điểm, Đ/S=7 điểm) → hệ thống tự chia "điểm mỗi câu".
              </div>
            </div>

            <PointsConfigEditor
              config={pendingPointsConfig}
              onChange={async (cfg) => {
                setPendingPointsConfig(cfg);
                await finalizeCreateExam(cfg);
              }}
              onClose={() => {
                if (isUploading) return;
                resetPendingUpload();
              }}
            />
          </div>
        </div>
      )}

      {/* ═══ MODAL: Create Room ═══ */}
      {showCreateRoom && selectedExamForRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl my-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">🏠 Tạo phòng thi</h3>

            <div className="bg-teal-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-teal-600">Đề thi:</p>
              <p className="font-bold text-teal-900">{selectedExamForRoom.title}</p>
              <p className="text-sm text-teal-600">{selectedExamForRoom.questions.length} câu hỏi</p>
            </div>

            {/* Thời gian */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">⏱️ Thời gian làm bài (phút):</label>
              <input
                type="number"
                value={roomTimeLimit}
                onChange={(e) => setRoomTimeLimit(parseInt(e.target.value) || 45)}
                min={5}
                max={180}
                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* Chọn lớp */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">👥 Chọn lớp (tùy chọn):</label>
              <select
                value={selectedClassForRoom}
                onChange={(e) => setSelectedClassForRoom(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
              >
                <option value="">-- Tất cả học sinh --</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.totalStudents} HS)
                  </option>
                ))}
              </select>
            </div>

            {/* Hẹn giờ mở/đóng */}
            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl hover:bg-indigo-100 transition">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="w-5 h-5 accent-indigo-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">⏰ Hẹn giờ mở/đóng phòng</div>
                  <div className="text-xs text-gray-600 mt-0.5">Nếu bật, học sinh chỉ thi trong khoảng thời gian này</div>
                </div>
              </label>

              {scheduleEnabled && (
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giờ mở:</label>
                    <input
                      type="datetime-local"
                      value={roomOpensAt}
                      onChange={(e) => setRoomOpensAt(e.target.value)}
                      className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giờ đóng:</label>
                    <input
                      type="datetime-local"
                      value={roomClosesAt}
                      onChange={(e) => setRoomClosesAt(e.target.value)}
                      className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Nếu để trống "giờ đóng" → hệ thống tự đóng = giờ mở + {roomTimeLimit} phút.
                  </p>
                </div>
              )}
            </div>

            {/* ✅ MỚI: Số lần thi tối đa */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔄 Số lần thi tối đa:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 1,  label: '1 lần',          desc: 'Chỉ thi 1 lần duy nhất',       color: 'teal'   },
                  { value: 2,  label: '2 lần',          desc: 'Được thi lại tối đa 2 lần',     color: 'blue'   },
                  { value: 3,  label: '3 lần',          desc: 'Được thi lại tối đa 3 lần',     color: 'purple' },
                  { value: 0,  label: 'Không giới hạn', desc: 'Thi bao nhiêu lần cũng được',   color: 'orange' },
                ] as { value: number; label: string; desc: string; color: string }[]).map((opt) => {
                  const sel = maxAttempts === opt.value;
                  const cls: Record<string, string> = {
                    teal:   sel ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200'       : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/50',
                    blue:   sel ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'       : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50',
                    purple: sel ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50',
                    orange: sel ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50',
                  };
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMaxAttempts(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition ${cls[opt.color]}`}
                    >
                      <div className="font-semibold text-gray-900 text-sm">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
              {maxAttempts > 1 && (
                <p className="text-xs text-blue-600 mt-2">
                  ℹ️ Học sinh có thể thi lại tối đa {maxAttempts} lần. Điểm cao nhất sẽ được ghi nhận.
                </p>
              )}
              {maxAttempts === 0 && (
                <p className="text-xs text-orange-600 mt-2">
                  ⚠️ Học sinh có thể thi không giới hạn số lần.
                </p>
              )}
            </div>

            {/* Cho phép thi tự do */}
            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-orange-50 border-2 border-orange-200 rounded-xl hover:bg-orange-100 transition">
                <input
                  type="checkbox"
                  checked={allowAnonymous}
                  onChange={(e) => setAllowAnonymous(e.target.checked)}
                  className="w-5 h-5 accent-orange-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">🆓 Cho phép thi tự do</div>
                  <div className="text-xs text-gray-600 mt-0.5">Học sinh có thể thi mà không cần đăng nhập Google</div>
                </div>
              </label>
            </div>

            {/* Cho phép xem đáp án */}
            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-green-50 border-2 border-green-200 rounded-xl hover:bg-green-100 transition">
                <input
                  type="checkbox"
                  checked={showCorrectAnswers}
                  onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                  className="w-5 h-5 accent-green-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">✅ Cho xem đáp án đúng</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Học sinh có thể xem đáp án đúng sau khi nộp bài
                  </div>
                </div>
              </label>
            </div>

            {/* Cho phép xem lời giải */}
            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 transition">
                <input
                  type="checkbox"
                  checked={showExplanations}
                  onChange={(e) => setShowExplanations(e.target.checked)}
                  className="w-5 h-5 accent-blue-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">📖 Cho xem lời giải</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Học sinh có thể xem lời giải chi tiết cho từng câu hỏi
                  </div>
                </div>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetRoomModal}
                className="flex-1 py-3 rounded-xl font-semibold border-2 border-gray-300 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateRoom}
                className="flex-1 py-3 rounded-xl font-bold text-white transition"
                style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
              >
                ✓ Tạo phòng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Create Class ═══ */}
      {showCreateClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">🎓 Tạo lớp mới</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên lớp: <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="VD: 10A1, Toán 11, ..."
                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Khối (tùy chọn):</label>
              <select
                value={newClassGrade}
                onChange={(e) => setNewClassGrade(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
              >
                <option value="">-- Chọn khối --</option>
                <option value="10">Khối 10</option>
                <option value="11">Khối 11</option>
                <option value="12">Khối 12</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateClass(false);
                  setNewClassName('');
                  setNewClassGrade('');
                }}
                className="flex-1 py-3 rounded-xl font-semibold border-2 border-gray-300 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateClass}
                className="flex-1 py-3 rounded-xl font-bold text-white transition"
                style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
              >
                ✓ Tạo lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: View Class Students ═══ */}
      {selectedClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-purple-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{selectedClass.name}</h3>
                  <p className="text-purple-100 text-sm">{classStudents.length} học sinh</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedClass(null);
                    setClassStudents([]);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition"
                >
                  ✖
                </button>
              </div>
            </div>

            <div className="p-6">
              {classStudents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">👥</div>
                  <p className="text-gray-500">Chưa có học sinh trong lớp</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {classStudents.map((student, idx) => (
                    <div key={student.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        {student.avatar ? (
                          <img src={student.avatar} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center font-bold">
                            {student.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">{student.name}</p>
                          <p className="text-sm text-gray-500">{student.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Xóa ${student.name} khỏi lớp?`)) {
                            removeStudentFromClass(selectedClass.id, student.id).then(() => {
                              loadClassStudents(selectedClass.id);
                              loadData();
                            });
                          }
                        }}
                        className="px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm"
                      >
                        Xóa
      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Submission Detail View ═══ */}
      {selectedSubmission && currentExam && (
        <SubmissionDetailView
          submission={selectedSubmission}
          exam={currentExam}
          onClose={() => setSelectedSubmission(null)}
        />
      )}

      {/* ═══ MỚI: Live Monitoring Panel ═══ */}
      {monitoringRoom && (
        <LiveMonitoringPanel
          roomId={monitoringRoom.id}
          roomCode={monitoringRoom.code}
          examTitle={monitoringRoom.examTitle}
          timeLimit={monitoringRoom.timeLimit}
          onClose={() => setMonitoringRoom(null)}
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
