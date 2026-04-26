// ============ ENUMS ============

export enum Role {
  STUDENT = 'student',
  TEACHER = 'teacher',
  ADMIN = 'admin',
  MEMBER = 'member',
  DEPUTY = 'deputy',
  LEADER = 'leader'
}

// ============ QUESTION TYPES ============

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'writing'
  | 'unknown';

// ============ IMAGE DATA ============

export interface ImageData {
  id: string;
  filename: string;
  base64: string;
  contentType: string;
  rId?: string;
}

// ============ USER ============

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: Role;
  status?: 'online' | 'offline' | 'busy';
  isApproved?: boolean;
  createdAt?: Date;
  classIds?: string[];
}

// ============ CLASS ============

export interface Class {
  id: string;
  name: string;
  grade?: string;
  subject?: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  totalStudents: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============ STUDENT ACCOUNT ============

export interface StudentAccount {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  classId?: string;
  className?: string;
  teacherId: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface CreateStudentAccountInput {
  username: string;
  password: string;
  name: string;
  classId?: string;
  className?: string;
  teacherId: string;
}

export interface BulkImportStudentRow {
  name: string;
  username: string;
  password: string;
  className?: string;
}

export interface BulkImportResult {
  success: number;
  failed: number;
  errors: string[];
}

// ============ KNOWLEDGE BASE ============

export interface LearningObjective {
  id: string;
  description: string;
  level: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
}

export interface KnowledgeUnit {
  id: string;
  title: string;
  subject: string;
  grade: string;
  content: string;
  objectives: LearningObjective[];
  teacherId: string;
  createdAt: any;
  updatedAt: any;
}

// ============ STUDENT INFO ============

export interface StudentInfo {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  className?: string;
  classId?: string;
  studentId?: string;
}

// ============ QUESTION & OPTIONS ============

export interface QuestionOption {
  letter: string;
  text: string;
  textWithUnderline?: string;
  isCorrect?: boolean;
}

export interface SectionInfo {
  letter: string;
  name: string;
  points: string;
}

export interface Question {
  number: number;
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  correctAnswer: string | null;
  section?: SectionInfo;
  part?: string;
  passage?: string;
  solution?: string;
  images?: ImageData[];
  tfStatements?: { [key: string]: string };
  knowledgeUnitId?: string;
  objectiveId?: string;
}

// ============ EXAM SECTION ============

export interface ExamSection {
  name: string;
  description: string;
  points: string;
  readingPassage?: string;
  questions: Question[];
  sectionType?: QuestionType;
}

// ============ EXAM DATA ============

export interface ExamData {
  title: string;
  subject?: 'math' | 'english' | 'other';
  timeLimit?: number;
  sections: ExamSection[];
  questions: Question[];
  answers: { [key: number]: string };
  images?: ImageData[];
}

// ============ FLEXIBLE SCORING SYSTEM ============

export type TrueFalseMode = 'equal' | 'stepped';

export interface SectionPointsConfig {
  sectionId: string;
  sectionName: string;
  questionType: 'multiple_choice' | 'true_false' | 'short_answer';
  totalQuestions: number;
  totalPoints: number;
  pointsPerQuestion: number;
  trueFalseMode?: TrueFalseMode;
}

export interface ExamPointsConfig {
  maxScore: number;
  sections: SectionPointsConfig[];
  autoBalance?: boolean;
}

// ============ ROOM SETTINGS ============

export interface RoomSettings {
  allowLateJoin: boolean;
  showResultAfterSubmit: boolean;
  shuffleQuestions: boolean;
  maxAttempts: number;
  allowAnonymous: boolean;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  showAnswersAfterClose?: boolean;
  allowReview?: boolean;
}

// ============ ROOM ============

export interface Room {
  id: string;
  code: string;
  examId: string;
  examTitle: string;
  teacherId: string;
  teacherName: string;
  classId?: string;
  className?: string;
  status: 'waiting' | 'active' | 'closed';
  startTime?: Date;
  endTime?: Date;
  timeLimit: number;
  settings: RoomSettings;
  allowLateJoin?: boolean;
  showResultAfterSubmit?: boolean;
  shuffleQuestions?: boolean;
  maxAttempts?: number;
  allowAnonymous?: boolean;
  totalStudents: number;
  submittedCount: number;
  createdAt?: Date;
  updatedAt?: Date;
  opensAt?: Date;
  closesAt?: Date;
  knowledgeUnitId?: string;
}

// ============ EXAM ============

export interface Exam {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  timeLimit: number;
  questions: Question[];
  sections: ExamSection[];
  answers: { [key: number]: string };
  images?: ImageData[];
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  pointsConfig?: ExamPointsConfig;
  knowledgeUnitId?: string;
}

// ============ SCORE BREAKDOWN ============

export interface ScoreBreakdown {
  multipleChoice: {
    total: number;
    correct: number;
    points: number;
    pointsPerQuestion?: number;
  };
  trueFalse: {
    total: number;
    correct: number;
    partial: number;
    points: number;
    pointsPerQuestion?: number;
    details: {
      [questionNumber: number]: {
        correctCount: number;
        points: number;
      };
    };
  };
  shortAnswer: {
    total: number;
    correct: number;
    points: number;
    pointsPerQuestion?: number;
  };
  totalScore: number;
  percentage: number;
}

// ============ SUBMISSION ============

export interface Submission {
  id: string;
  roomId: string;
  roomCode: string;
  examId: string;
  student: StudentInfo;
  answers: { [questionNumber: number]: string };
  scoreBreakdown: ScoreBreakdown;
  totalScore: number;
  percentage: number;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  tabSwitchCount: number;
  tabSwitchWarnings: Date[];
  autoSubmitted: boolean;
  startedAt?: Date;
  submittedAt?: Date;
  duration: number;
  status: 'in_progress' | 'submitted' | 'graded';
}

// ============ ROOM WITH EXAM ============

export interface RoomWithExam extends Room {
  exam: Exam;
}

// ============ LEADERBOARD ============

export interface LeaderboardEntry {
  rank: number;
  student: StudentInfo;
  score: number;
  percentage: number;
  duration: number;
  submittedAt?: Date;
  scoreBreakdown?: ScoreBreakdown;
}

// ============ CLASS JOIN REQUEST ============

export interface ClassJoinRequest {
  id: string;
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: Date;
  processedAt?: Date;
  processedBy?: string;
}

// ============ AI ASSESSMENT ============

export interface StudentAssessmentResult {
  studentId: string;
  studentName: string;
  percentage: number;
  masteredObjectives: string[];
  weakObjectives: string[];
  overallVerdict: 'Đạt' | 'Chưa đạt';
  advice: string;
}

export interface ClassAssessmentReport {
  knowledgeUnitTitle: string;
  examTitle: string;
  generatedAt: Date;
  classAverage: number;
  passRate: number;
  commonWeakObjectives: string[];
  studentResults: StudentAssessmentResult[];
  aiSummary: string;
}

// ============ SESSION TRACKING (MỚI) ============

export type ViolationType = 'tab_switch' | 'multi_device' | 'auto_submit' | 'focus_loss';

export interface SessionViolation {
  type: ViolationType;
  timestamp: string;   // ISO string
  detail?: string;
}

/**
 * Phiên thi của một học sinh trong một phòng.
 * Lưu tại Firestore: examSessions/{roomId}_{studentId}
 */
export interface ExamSession {
  sessionId: string;          // UUID tạo mới mỗi lần mở tab
  roomId: string;
  studentId: string;
  studentName: string;
  className?: string;
  deviceInfo: string;         // user-agent rút gọn
  startedAt: any;             // serverTimestamp
  lastHeartbeat: any;         // serverTimestamp, cập nhật mỗi 15s
  tabSwitches: number;
  violations: SessionViolation[];
  answeredCount: number;      // số câu đã trả lời (cập nhật theo heartbeat)
  totalQuestions: number;
  timeRemaining: number;      // giây còn lại (cập nhật theo heartbeat)
  status: 'active' | 'submitted' | 'disconnected';
}
