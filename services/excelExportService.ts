import * as XLSX from 'xlsx';
import { Submission, Room } from '../types';
import { formatScore } from './scoringService';

export const exportSubmissionsToExcel = (
  submissions: Submission[],
  room: Room
) => {
  // Chuẩn bị dữ liệu
  const data = submissions.map((sub, index) => ({
    'STT': index + 1,
    'Họ tên': sub.student.name,
    'Lớp': sub.student.className || '',
    'Email': sub.student.email || '',
    'Điểm': formatScore(sub.totalScore),
    'Phần trăm': `${sub.percentage}%`,
    'Trắc nghiệm': `${sub.scoreBreakdown.multipleChoice.correct}/${sub.scoreBreakdown.multipleChoice.total}`,
    'Đúng/Sai': `${sub.scoreBreakdown.trueFalse.correct}/${sub.scoreBreakdown.trueFalse.total}`,
    'Trả lời ngắn': `${sub.scoreBreakdown.shortAnswer.correct}/${sub.scoreBreakdown.shortAnswer.total}`,
    'Thời gian (s)': sub.duration,
    'Cảnh báo tab': sub.tabSwitchCount || 0
  }));

  // Tạo worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // Tạo workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kết quả');

  // Xuất file
  const fileName = `KetQua_${room.code}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
