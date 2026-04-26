/**
 * examWordExportService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Xuất đề thi sang file Word (.docx) ngay trong trình duyệt.
 * Sử dụng thư viện `docx` (https://docx.js.org).
 *
 * ✅ FIX Bug 3: Công thức LaTeX (\(...\), \[...\], $...$, $$...$$)
 *    được render thành ảnh PNG qua KaTeX và nhúng inline vào Word.
 *    Không còn hiển thị "[công thức]" nữa.
 *
 * Cài đặt (nếu chưa có): npm install docx katex
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
} from 'docx';

// ✅ Import getExam để tự reload ảnh từ subcollection nếu cần
import { getExam } from '../services/firebaseService';
import type { Exam, ExamData, Question } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 1: LaTeX renderer (KaTeX → SVG → Canvas → PNG ArrayBuffer)
// ─────────────────────────────────────────────────────────────────────────────

/** Cache tránh render lại cùng 1 công thức */
const _mathCache = new Map<string, ArrayBuffer | null>();

/**
 * Render biểu thức LaTeX thành PNG ArrayBuffer.
 * Trả về null nếu KaTeX chưa cài hoặc render lỗi (sẽ fallback về text).
 */
async function latexToPngBuffer(
  latex: string,
  fontSizePt: number,
): Promise<ArrayBuffer | null> {
  const cacheKey = `${latex}|${fontSizePt}`;
  if (_mathCache.has(cacheKey)) return _mathCache.get(cacheKey)!;

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const katex: any = await (new Function('return import("katex")')() as Promise<any>).catch(() => null);
    if (!katex) { _mathCache.set(cacheKey, null); return null; }

    const html = katex.default.renderToString(latex, {
      throwOnError: false,
      output: 'html',
      displayMode: false,
    });

    // Đo kích thước thực bằng cách render ẩn trước
    const measure = document.createElement('div');
    measure.style.cssText = [
      'position:fixed', 'top:-9999px', 'left:-9999px',
      `font-size:${fontSizePt}px`,
      'font-family:"Times New Roman",Times,serif',
      'line-height:1.4', 'white-space:nowrap',
      'background:white', 'padding:2px 4px', 'color:#000',
    ].join(';');
    measure.innerHTML = html;
    document.body.appendChild(measure);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const rect = measure.getBoundingClientRect();
    const W = Math.max(Math.ceil(rect.width) + 8, 20);
    const H = Math.max(Math.ceil(rect.height) + 6, 16);
    document.body.removeChild(measure);

    // SVG foreignObject bao lấy HTML, rồi chụp Canvas → PNG
    const svgStr = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
      `<foreignObject width="${W}" height="${H}">`,
      `<div xmlns="http://www.w3.org/1999/xhtml" style=`,
      `"font-size:${fontSizePt}px;font-family:'Times New Roman',Times,serif;`,
      `line-height:1.4;white-space:nowrap;background:white;padding:2px 4px;color:#000;">`,
      html,
      `</div></foreignObject></svg>`,
    ].join('');

    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl  = URL.createObjectURL(svgBlob);

    const buffer = await new Promise<ArrayBuffer | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const SCALE = 2; // Retina quality
        const canvas = document.createElement('canvas');
        canvas.width  = W * SCALE;
        canvas.height = H * SCALE;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob(
          (blob) => blob ? blob.arrayBuffer().then(resolve).catch(() => resolve(null)) : resolve(null),
          'image/png',
        );
      };
      img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(null); };
      img.src = svgUrl;
    });

    _mathCache.set(cacheKey, buffer);
    return buffer;
  } catch {
    _mathCache.set(cacheKey, null);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 2: Parser HTML + LaTeX → mảng Segment
// ─────────────────────────────────────────────────────────────────────────────

interface Segment {
  kind: 'text' | 'math' | 'html_img' | 'html_block';
  content: string;   // text/LaTeX/src/html
  isBlock: boolean;
}

/** Tách chuỗi HTML thành đoạn text + đoạn LaTeX + đoạn ảnh/bảng xen kẽ */
function parseSegments(html: string): Segment[] {
  // 1. Tách <table> và <img> ra trước khi strip HTML
  const segs: Segment[] = [];

  // Regex tìm các block cần giữ lại nguyên vẹn (table, figure, img)
  const BLOCK_RE = /(<table[\s\S]*?<\/table>|<img[^>]*>)/gi;
  const parts = html.split(BLOCK_RE);

  for (const part of parts) {
    if (!part) continue;

    if (/^<table/i.test(part)) {
      // HTML table → sẽ render thành ảnh
      segs.push({ kind: 'html_block', content: part, isBlock: true });
      continue;
    }

    if (/^<img/i.test(part)) {
      // Lấy src của img
      const srcMatch = part.match(/src=["']([^"']+)["']/i);
      const src = srcMatch?.[1] ?? '';
      if (src) segs.push({ kind: 'html_img', content: src, isBlock: false });
      continue;
    }

    // Phần còn lại: xử lý text + LaTeX
    const text = part
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    const MATH_RE = /(\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)[\s\S]+?(?<!\$)\$(?!\$))/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = MATH_RE.exec(text)) !== null) {
      if (m.index > last) {
        const t = text.slice(last, m.index).replace(/\n/g, ' ').trim();
        if (t) segs.push({ kind: 'text', content: t, isBlock: false });
      }
      const raw = m[0];
      const isBlock = raw.startsWith('\\[') || raw.startsWith('$$');
      const latex = raw
        .replace(/^\\\[|\\\]$/g, '').replace(/^\$\$|\$\$$/g, '')
        .replace(/^\\\(|\\\)$/g, '').replace(/^\$|\$$/g, '').trim();
      if (latex) segs.push({ kind: 'math', content: latex, isBlock });
      last = m.index + raw.length;
    }

    if (last < text.length) {
      const t = text.slice(last).replace(/\n/g, ' ').trim();
      if (t) segs.push({ kind: 'text', content: t, isBlock: false });
    }
  }

  return segs.filter((s) => s.content.trim() !== '' || s.kind !== 'text');
}

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 3: Chuyển HTML+LaTeX → mảng TextRun / ImageRun của docx
// ─────────────────────────────────────────────────────────────────────────────

interface RunStyle {
  size?: number;   // half-points (24 = 12pt)
  bold?: boolean;
  italics?: boolean;
  color?: string;
}

/**
 * ✅ Render HTML block (table, figure...) → PNG ArrayBuffer qua SVG foreignObject
 */
async function htmlBlockToBuffer(htmlBlock: string, fontSizePt: number): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    try {
      const W = 500, H = 200;
      // Thêm CSS cơ bản cho table
      const styledHtml = `<style>
        table{border-collapse:collapse;font-family:'Times New Roman',serif;font-size:${fontSizePt}px}
        td,th{border:1px solid #888;padding:3px 6px;text-align:center}
        th{background:#e8f0fe;font-weight:bold}
      </style>${htmlBlock}`;

      const svgStr = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
        `<foreignObject width="${W}" height="${H}">`,
        `<div xmlns="http://www.w3.org/1999/xhtml" style="background:white;padding:4px;">`,
        styledHtml,
        `</div></foreignObject></svg>`,
      ].join('');

      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();

      img.onload = () => {
        const SCALE = 2;
        const canvas = document.createElement('canvas');
        canvas.width  = W * SCALE;
        canvas.height = H * SCALE;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (b) => b ? b.arrayBuffer().then(resolve).catch(() => resolve(null)) : resolve(null),
          'image/png',
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch { resolve(null); }
  });
}

/**
 * ✅ Hàm cốt lõi: Chuyển HTML (có LaTeX / img / table) → mảng docx Runs.
 *
 * - Text thường → TextRun
 * - LaTeX        → KaTeX PNG → ImageRun
 * - <img src>   → ImageRun (base64 hoặc data URL)
 * - <table>     → render canvas → ImageRun
 */
async function htmlToRuns(
  html: string,
  style: RunStyle = {},
): Promise<(TextRun | ImageRun)[]> {
  const { size = 24, bold = false, italics = false, color = '1f2937' } = style;
  const fontSizePt = size / 2;

  const segs = parseSegments(html);
  const runs: (TextRun | ImageRun)[] = [];

  for (const seg of segs) {
    if (seg.kind === 'text') {
      if (!seg.content.trim()) continue;
      runs.push(new TextRun({ text: seg.content, size, bold, italics, color, font: 'Times New Roman' }));

    } else if (seg.kind === 'math') {
      const buf = await latexToPngBuffer(seg.content, fontSizePt);
      if (buf) {
        const imgH = Math.round(fontSizePt * 2.2);
        const imgW = Math.min(Math.round(imgH * 4.5), 320);
        runs.push(new ImageRun({ data: buf, transformation: { width: imgW, height: imgH }, type: 'png' } as any));
      } else {
        runs.push(new TextRun({ text: `$${seg.content}$`, size, color: 'cc0000', font: 'Courier New' }));
      }

    } else if (seg.kind === 'html_img') {
      // <img src="data:image/...;base64,...">
      try {
        const src = seg.content;
        const rawB64 = src.startsWith('data:') ? src.split(',')[1] : src;
        if (rawB64 && rawB64.length > 50) {
          const buf  = base64ToBuffer(rawB64);
          const mime = src.startsWith('data:') ? src.split(';')[0].split(':')[1] : 'image/png';
          runs.push(new ImageRun({
            data: buf,
            transformation: { width: 300, height: 200 },
            type: (mime.split('/')[1] ?? 'png') as any,
          } as any));
        }
      } catch { /* bỏ qua */ }

    } else if (seg.kind === 'html_block') {
      // HTML table / figure → render thành PNG
      const buf = await htmlBlockToBuffer(seg.content, fontSizePt);
      if (buf) {
        runs.push(new ImageRun({
          data: buf,
          transformation: { width: 440, height: 140 },
          type: 'png',
        } as any));
      }
    }
  }

  return runs;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 4: Helpers layout
// ─────────────────────────────────────────────────────────────────────────────

const cellBorder  = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' };
const allBorders  = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const HEADER_FILL = 'D6E4F0';

const blank = (spacingBefore = 80) =>
  new Paragraph({ spacing: { before: spacingBefore, after: 0 }, children: [] });

const partHeader = (text: string) =>
  new Paragraph({
    spacing: { before: 320, after: 120 },
    shading: { fill: 'EBF5FB', type: ShadingType.CLEAR },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2E86C1', space: 1 } },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Times New Roman', color: '1A5276' })],
  });

/** Chuyển base64 string (có hoặc không có prefix data:...) thành ArrayBuffer */
function base64ToBuffer(b64: string): ArrayBuffer {
  // Strip data: prefix nếu có, và xóa mọi whitespace (xuống dòng khi ghép chunks)
  const raw = (b64.startsWith('data:') ? b64.split(',')[1] : b64)
    .replace(/\s/g, '');
  const bin = atob(raw);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/**
 * Tạo mảng Paragraph từ danh sách hình ảnh của câu hỏi.
 * Mỗi ảnh được nhúng inline vào Word dưới dạng ImageRun.
 */
function buildImageParagraphs(images: any[]): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const img of images) {
    if (!img?.base64) continue;
    try {
      const buf  = base64ToBuffer(img.base64);
      const mime = (img.contentType ?? 'image/png') as string;
      const ext  = mime.split('/')[1] ?? 'png';
      paras.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 100 },
          children: [
            new ImageRun({
              data: buf,
              transformation: { width: 380, height: 220 },
              type: ext as any,
            } as any),
          ],
        }),
      );
    } catch {
      // bỏ qua ảnh lỗi
    }
  }
  return paras;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 5: Builders từng loại câu (đều async)
// ─────────────────────────────────────────────────────────────────────────────

/** PHẦN 1 – Trắc nghiệm nhiều lựa chọn */
const buildMCQuestion = async (
  q: Question,
  displayNum: number,
): Promise<Paragraph[]> => {
  const items: Paragraph[] = [];

  // Nội dung câu hỏi
  const qRuns = await htmlToRuns(q.text, { size: 24 });
  items.push(new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [
      new TextRun({ text: `Câu ${displayNum}: `, bold: true, size: 24, font: 'Times New Roman' }),
      ...qRuns,
    ],
  }));

  // ✅ Hình ảnh đính kèm câu hỏi
  buildImageParagraphs((q as any).images ?? []).forEach((p) => items.push(p));

  // Phương án A/B/C/D theo vị trí (không dùng opt.letter gốc)
  const LETTERS = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < q.options.length; i++) {
    const label = LETTERS[i] ?? q.options[i].letter.toUpperCase();
    const optRuns = await htmlToRuns(q.options[i].text, { size: 24 });
    items.push(new Paragraph({
      spacing: { before: 40, after: 0 },
      indent: { left: 720 },
      children: [
        new TextRun({ text: `${label}. `, bold: false, size: 24, font: 'Times New Roman' }),
        ...optRuns,
      ],
    }));
  }

  return items;
};

/** PHẦN 2 – Trắc nghiệm Đúng/Sai */
const buildTFQuestion = async (
  q: Question,
  displayNum: number,
): Promise<Paragraph[]> => {
  const items: Paragraph[] = [];
  const stmtLetters = ['a', 'b', 'c', 'd'];

  const qRuns = await htmlToRuns(q.text, { size: 24 });
  items.push(new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [
      new TextRun({ text: `Câu ${displayNum}: `, bold: true, size: 24, font: 'Times New Roman' }),
      ...qRuns,
    ],
  }));

  // ✅ Hình ảnh đính kèm câu hỏi
  buildImageParagraphs((q as any).images ?? []).forEach((p) => items.push(p));

  const stmts: { letter: string; text: string }[] =
    q.tfStatements && Object.keys(q.tfStatements).length > 0
      ? Object.entries(q.tfStatements).map(([l, t]) => ({ letter: l, text: t as string }))
      : q.options.map((o, i) => ({ letter: stmtLetters[i] ?? o.letter.toLowerCase(), text: o.text }));

  for (const stmt of stmts) {
    const sRuns = await htmlToRuns(stmt.text, { size: 24 });
    items.push(new Paragraph({
      spacing: { before: 40, after: 0 },
      indent: { left: 720 },
      children: [
        new TextRun({ text: `${stmt.letter}) `, bold: true, size: 24, font: 'Times New Roman' }),
        ...sRuns,
        new TextRun({ text: '   ☐ Đúng   ☐ Sai', size: 22, font: 'Times New Roman', color: '555555' }),
      ],
    }));
  }

  return items;
};

/** PHẦN 3 – Trả lời ngắn */
const buildSAQuestion = async (
  q: Question,
  displayNum: number,
): Promise<Paragraph[]> => {
  const qRuns = await htmlToRuns(q.text, { size: 24 });
  const items: Paragraph[] = [
    new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [
        new TextRun({ text: `Câu ${displayNum}: `, bold: true, size: 24, font: 'Times New Roman' }),
        ...qRuns,
      ],
    }),
  ];

  // ✅ Hình ảnh đính kèm câu hỏi
  buildImageParagraphs((q as any).images ?? []).forEach((p) => items.push(p));

  items.push(new Paragraph({
    spacing: { before: 60, after: 0 },
    indent: { left: 720 },
    children: [new TextRun({ text: 'Đáp án: ……………………………………………………………………', size: 24, font: 'Times New Roman', color: '888888' })],
  }));

  return items;
};

/** Bảng đáp án PHẦN 1 (5 câu/hàng) – giữ nguyên cấu trúc cũ */
const buildAnswerTable = (
  mcQuestions: Question[],
  answers: Record<number, string>,
): Table => {
  const COLS = 5;
  const colW = Math.floor(9360 / COLS);
  const rows: TableRow[] = [];

  for (let row = 0; row < mcQuestions.length; row += COLS) {
    // Header row (số câu)
    rows.push(new TableRow({
      children: Array.from({ length: COLS }, (_, i) => {
        const q = mcQuestions[row + i];
        return new TableCell({
          width: { size: colW, type: WidthType.DXA },
          borders: allBorders,
          shading: { fill: HEADER_FILL, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: q ? `Câu ${row + i + 1}` : '', bold: true, size: 20, font: 'Times New Roman' })],
          })],
        });
      }),
    }));
    // Answer row
    rows.push(new TableRow({
      children: Array.from({ length: COLS }, (_, i) => {
        const q = mcQuestions[row + i];
        const ans = q ? (answers[q.number] ?? '?') : '';
        return new TableCell({
          width: { size: colW, type: WidthType.DXA },
          borders: allBorders,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: ans.toUpperCase(), bold: true, size: 22, font: 'Times New Roman', color: ans && ans !== '?' ? '1A5276' : 'AAAAAA' })],
          })],
        });
      }),
    }));
  }

  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: Array(COLS).fill(colW), rows });
};

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 6: Main export function
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportExamOptions {
  /** Kèm đáp án cuối tài liệu (default: false) */
  includeAnswerKey?: boolean;
  /** Override tiêu đề */
  title?: string;
  /** Tên trường */
  schoolName?: string;
  /** Tên giáo viên */
  teacherName?: string;
}

/**
 * Xuất đề thi sang Word và trigger download.
 *
 * ✅ Công thức LaTeX được render thành ảnh PNG nhúng vào tài liệu.
 * ✅ Tự động reload ảnh từ Firestore subcollection nếu exam object chưa có ảnh.
 */
export const exportExamToWord = async (
  exam: Exam | ExamData,
  opts: ExportExamOptions = {},
): Promise<void> => {
  const {
    includeAnswerKey = false,
    title,
    schoolName = 'LMS Thầy Phạm Hoàng-BTL',
    teacherName,
  } = opts;

  // ✅ FIX: Kiểm tra xem exam có images chưa.
  // Nếu chưa (vì bị strip vào subcollection khi createExam),
  // gọi getExam để load lại đầy đủ base64 từ subcollection.
  let fullExam: Exam | ExamData = exam;
  const examId = (exam as any).id as string | undefined;

  if (examId) {
    const hasImages = (exam.questions ?? []).some(
      (q: any) => q.images?.length > 0 && q.images.some((img: any) => img.base64),
    );

    if (!hasImages) {
      // Reload từ Firestore để lấy đủ images
      const reloaded = await getExam(examId).catch(() => null);
      if (reloaded) {
        fullExam = reloaded;
      }
    }
  }

  const examTitle  = title ?? (fullExam as any).title ?? 'Đề thi';
  const questions: Question[] = fullExam.questions ?? [];
  const answers: Record<number, string> = (fullExam as any).answers ?? {};

  const mcQuestions = questions.filter((q) => q.type === 'multiple_choice');
  const tfQuestions = questions.filter((q) => q.type === 'true_false');
  const saQuestions = questions.filter((q) => q.type === 'short_answer' || q.type === 'writing');

  const children: (Paragraph | Table)[] = [];

  // Tiêu đề trường
  if (schoolName) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: schoolName.toUpperCase(), bold: true, size: 28, font: 'Times New Roman', color: '1A5276' })],
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '2E86C1', space: 2 } },
    children: [new TextRun({ text: examTitle.toUpperCase(), bold: true, size: 32, font: 'Times New Roman', color: '1A5276' })],
  }));

  const timeLimit = (fullExam as any).timeLimit ?? 90;
  const today     = new Date().toLocaleDateString('vi-VN');
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 240 },
    children: [
      new TextRun({ text: `Thời gian: ${timeLimit} phút  |  Tổng số câu: ${questions.length}  |  Ngày: ${today}`, size: 22, font: 'Times New Roman', italics: true, color: '555555' }),
      ...(teacherName ? [new TextRun({ text: `  |  GV: ${teacherName}`, size: 22, font: 'Times New Roman', italics: true, color: '555555' })] : []),
    ],
  }));

  // PHẦN 1
  if (mcQuestions.length > 0) {
    children.push(partHeader(`PHẦN 1. TRẮC NGHIỆM NHIỀU LỰA CHỌN (${mcQuestions.length} câu)`));
    children.push(new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [new TextRun({ text: 'Chọn một đáp án đúng trong số A, B, C, D cho mỗi câu sau.', size: 22, font: 'Times New Roman', italics: true, color: '666666' })],
    }));
    let num = 1;
    for (const q of mcQuestions) {
      const paras = await buildMCQuestion(q, num++);
      paras.forEach((p) => children.push(p));
    }
  }

  // PHẦN 2
  if (tfQuestions.length > 0) {
    children.push(partHeader(`PHẦN 2. TRẮC NGHIỆM ĐÚNG SAI (${tfQuestions.length} câu)`));
    children.push(new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [new TextRun({ text: 'Với mỗi mệnh đề trong câu, hãy chọn Đúng (Đ) hoặc Sai (S).', size: 22, font: 'Times New Roman', italics: true, color: '666666' })],
    }));
    let num = mcQuestions.length + 1;
    for (const q of tfQuestions) {
      const paras = await buildTFQuestion(q, num++);
      paras.forEach((p) => children.push(p));
    }
  }

  // PHẦN 3
  if (saQuestions.length > 0) {
    children.push(partHeader(`PHẦN 3. TRẢ LỜI NGẮN (${saQuestions.length} câu)`));
    children.push(new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [new TextRun({ text: 'Điền đáp án số hoặc biểu thức vào ô trống.', size: 22, font: 'Times New Roman', italics: true, color: '666666' })],
    }));
    let num = mcQuestions.length + tfQuestions.length + 1;
    for (const q of saQuestions) {
      const paras = await buildSAQuestion(q, num++);
      paras.forEach((p) => children.push(p));
    }
  }

  // Đáp án
  if (includeAnswerKey && Object.keys(answers).length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(partHeader('ĐÁP ÁN PHẦN TRẮC NGHIỆM'));
    children.push(blank(120));

    if (mcQuestions.length > 0) {
      children.push(buildAnswerTable(mcQuestions, answers));
    }

    if (tfQuestions.length > 0) {
      children.push(blank(200));
      children.push(new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text: 'Đáp án Đúng/Sai (a/b/c/d = Đúng khi đúng, Sai khi sai):', bold: true, size: 24, font: 'Times New Roman' })],
      }));
      tfQuestions.forEach((q, idx) => {
        children.push(new Paragraph({
          spacing: { before: 60, after: 0 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: `Câu ${mcQuestions.length + idx + 1}: `, bold: true, size: 22, font: 'Times New Roman' }),
            new TextRun({ text: answers[q.number] || '—', size: 22, font: 'Times New Roman', color: '1A5276' }),
          ],
        }));
      });
    }

    if (saQuestions.length > 0) {
      children.push(blank(200));
      children.push(new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text: 'Đáp án Trả lời ngắn:', bold: true, size: 24, font: 'Times New Roman' })],
      }));
      saQuestions.forEach((q, idx) => {
        children.push(new Paragraph({
          spacing: { before: 60, after: 0 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: `Câu ${mcQuestions.length + tfQuestions.length + idx + 1}: `, bold: true, size: 22, font: 'Times New Roman' }),
            new TextRun({ text: answers[q.number] || '—', size: 22, font: 'Times New Roman', color: 'E74C3C' }),
          ],
        }));
      });
    }
  }

  // Build & download
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 850, bottom: 1134, left: 1134 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safeFilename = examTitle.replace(/[^a-zA-Z0-9À-ỹà-ỹ\s_-]/g, '').replace(/\s+/g, '_').slice(0, 80);
  a.href     = url;
  a.download = `${safeFilename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  _mathCache.clear();
};

// ─── Wrappers tiện lợi (giữ nguyên API cũ) ───────────────────────────────────

/** Xuất đề, không kèm đáp án */
export const exportExamOnly = (
  exam: Exam | ExamData,
  teacherName?: string,
  schoolName?: string,
) => exportExamToWord(exam, { includeAnswerKey: false, teacherName, schoolName });

/** Xuất đề + đáp án (dành cho GV in đề đáp án) */
export const exportExamWithAnswers = (
  exam: Exam | ExamData,
  teacherName?: string,
  schoolName?: string,
) => exportExamToWord(exam, { includeAnswerKey: true, teacherName, schoolName });
