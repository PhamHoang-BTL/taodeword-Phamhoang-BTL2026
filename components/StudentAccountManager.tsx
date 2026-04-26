// ============================================================
// StudentAccountManager.tsx
// Component quản lý tài khoản học sinh trong TeacherDashboard
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Class,
  StudentAccount,
  CreateStudentAccountInput,
  BulkImportStudentRow,
  BulkImportResult,
} from '../types';
import {
  createStudentAccount,
  getStudentAccountsByTeacher,
  deleteStudentAccount,
  resetStudentPassword,
  toggleStudentAccountStatus,
  bulkCreateStudentAccounts,
  isValidUsername,
} from '../services/studentAccountService';
import * as XLSX from 'xlsx';

type CreateStudentInput = CreateStudentAccountInput;
type BulkImportRow = BulkImportStudentRow;

interface Props {
  teacher: User;
  classes: Class[];
}

type Tab = 'list' | 'create' | 'import';

const StudentAccountManager: React.FC<Props> = ({ teacher, classes }) => {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create form
  const [form, setForm] = useState<CreateStudentInput>({
    username: '',
    password: '',
    name: '',
    classId: '',
    className: '',
    teacherId: teacher.id,
  });
  const [formError, setFormError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState('');

  // Import
  const [importRows, setImportRows] = useState<BulkImportRow[]>([]);
  const [importClassId, setImportClassId] = useState('');
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<StudentAccount | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Search / filter
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const list = await getStudentAccountsByTeacher(teacher.id);
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      setAccounts(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── CREATE ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setFormError('');
    setCreateSuccess('');

    if (!form.name.trim()) return setFormError('Vui lòng nhập họ tên.');
    if (!form.username.trim()) return setFormError('Vui lòng nhập tên đăng nhập.');
    if (!isValidUsername(form.username)) return setFormError('Tên đăng nhập chỉ dùng chữ cái, số, dấu _ (3-30 ký tự).');
    if (!form.password || form.password.length < 4) return setFormError('Mật khẩu ít nhất 4 ký tự.');

    setIsCreating(true);
    try {
      const selectedClass = classes.find((c) => c.id === form.classId);
      await createStudentAccount({
        ...form,
        username: form.username.trim().toLowerCase(),
        name: form.name.trim(),
        className: selectedClass?.name || form.className,
        teacherId: teacher.id,
      });
      setCreateSuccess(`✅ Đã tạo tài khoản "${form.username.toLowerCase()}" thành công!`);
      setForm({ username: '', password: '', name: '', classId: '', className: '', teacherId: teacher.id });
      await loadAccounts();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // ─── IMPORT EXCEL ─────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const parsed: BulkImportRow[] = rows
          .map((r) => ({
            name: r['ho_ten'] || r['Họ tên'] || r['ho ten'] || r['name'] || '',
            username: String(r['ten_dang_nhap'] || r['Tên đăng nhập'] || r['username'] || ''),
            password: String(r['mat_khau'] || r['Mật khẩu'] || r['password'] || ''),
            className: r['lop'] || r['Lớp'] || r['class'] || '',
          }))
          .filter((r) => r.name || r.username);

        setImportRows(parsed);
        setImportResult(null);
      } catch {
        alert('❌ Không đọc được file. Vui lòng dùng file Excel (.xlsx) theo mẫu.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await bulkCreateStudentAccounts(
        importRows,
        teacher.id,
        classes,
        importClassId || undefined
      );
      setImportResult(result);
      if (result.success > 0) {
        await loadAccounts();
        setImportRows([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err: any) {
      alert('❌ Lỗi import: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const ws_data = [
      ['ho_ten', 'ten_dang_nhap', 'mat_khau', 'lop'],
      ['Nguyễn Văn An', 'nguyenvanan', 'hoc123', '10A1'],
      ['Trần Thị Bình', 'tranthihinh', 'hoc456', '10A1'],
      ['Lê Hoàng Cường', 'lehoangcuong', 'hoc789', '10A2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachHocSinh');
    XLSX.writeFile(wb, 'ds_hocsinh_mau.xlsx');
  };

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPwd) return;
    setIsResetting(true);
    try {
      await resetStudentPassword(resetTarget.username, resetPwd);
      alert(`✅ Đặt lại mật khẩu cho "${resetTarget.name}" thành công!`);
      setResetTarget(null);
      setResetPwd('');
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  // ─── DELETE ───────────────────────────────────────────────────────────────

  const handleDelete = async (account: StudentAccount) => {
    if (!confirm(`Xóa tài khoản "${account.name}" (@${account.username})?\n\nHành động này không thể hoàn tác.`)) return;
    try {
      await deleteStudentAccount(account.username);
      setAccounts((prev) => prev.filter((a) => a.username !== account.username));
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  };

  // ─── TOGGLE STATUS ────────────────────────────────────────────────────────

  const handleToggle = async (account: StudentAccount) => {
    try {
      await toggleStudentAccountStatus(account.username, !account.isActive);
      setAccounts((prev) =>
        prev.map((a) => (a.username === account.username ? { ...a, isActive: !a.isActive } : a))
      );
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  };

  // ─── COPY LINK ────────────────────────────────────────────────────────────

  const copyLoginInfo = (account: StudentAccount) => {
    const text = `Tài khoản học sinh:\nTên đăng nhập: ${account.username}\nLớp: ${account.className || 'Chưa phân lớp'}`;
    navigator.clipboard.writeText(text).then(() => alert('✅ Đã copy thông tin tài khoản!'));
  };

  // ─── FILTERED LIST ────────────────────────────────────────────────────────

  const filtered = accounts.filter((a) => {
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.username.includes(search.toLowerCase());
    const matchClass = !filterClass || a.classId === filterClass || a.className === filterClass;
    return matchSearch && matchClass;
  });

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">🔑 Tài khoản Học sinh</h2>
          <p className="text-sm text-gray-500 mt-0.5">Tạo & quản lý tài khoản đăng nhập cho học sinh</p>
        </div>
        <span className="bg-teal-100 text-teal-800 text-sm font-semibold px-3 py-1 rounded-full">
          {accounts.length} tài khoản
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {([
          { key: 'list', label: '📋 Danh sách' },
          { key: 'create', label: '➕ Tạo mới' },
          { key: 'import', label: '📤 Import Excel' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === t.key
                ? 'bg-white text-teal-700 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: LIST ───────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="🔍 Tìm tên hoặc username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="">Tất cả lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={loadAccounts}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition"
            >
              🔄
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-3" />
              Đang tải...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <div className="text-5xl mb-3">👤</div>
              <p className="font-medium">Chưa có tài khoản học sinh nào</p>
              <p className="text-sm mt-1">Tạo mới hoặc import từ Excel</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-gray-200 rounded-xl">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Họ tên</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tài khoản</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lớp</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filtered.map((acc) => (
                    <tr key={acc.username} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-medium text-gray-800">{acc.name}</td>
                      <td className="px-4 py-3 font-mono text-teal-700">@{acc.username}</td>
                      <td className="px-4 py-3 text-gray-500">{acc.className || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggle(acc)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            acc.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {acc.isActive ? '✅ Hoạt động' : '🚫 Tắt'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => copyLoginInfo(acc)}
                            className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium transition"
                            title="Copy thông tin"
                          >
                            📋
                          </button>
                          <button
                            onClick={() => { setResetTarget(acc); setResetPwd(''); }}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium transition"
                            title="Đặt lại mật khẩu"
                          >
                            🔑
                          </button>
                          <button
                            onClick={() => handleDelete(acc)}
                            className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded font-medium transition"
                            title="Xóa tài khoản"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CREATE ─────────────────────────────────────────── */}
      {activeTab === 'create' && (
        <div className="max-w-md space-y-5">
          {createSuccess && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium">
              {createSuccess}
            </div>
          )}
          {formError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              ❌ {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Họ và tên <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nguyễn Văn An"
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Tên đăng nhập <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))
              }
              placeholder="nguyenvanan"
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">Chỉ chữ cái thường, số, dấu _ (3-30 ký tự)</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Mật khẩu <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Tối thiểu 4 ký tự"
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Lớp học</label>
            <select
              value={form.classId}
              onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
            >
              <option value="">— Không chọn lớp —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Đang tạo...
              </>
            ) : '➕ Tạo tài khoản'}
          </button>
        </div>
      )}

      {/* ── TAB: IMPORT ─────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div className="space-y-5">
          {/* Download template */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="font-semibold text-blue-800 text-sm">📄 File Excel mẫu</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Cột: <code className="bg-blue-100 px-1 rounded">ho_ten</code>,{' '}
                <code className="bg-blue-100 px-1 rounded">ten_dang_nhap</code>,{' '}
                <code className="bg-blue-100 px-1 rounded">mat_khau</code>,{' '}
                <code className="bg-blue-100 px-1 rounded">lop</code>
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
            >
              ⬇️ Tải mẫu
            </button>
          </div>

          {classes.length === 0 ? (
            <div className="p-4 bg-red-50 border border-red-300 rounded-xl">
              <p className="text-sm font-semibold text-red-800">⚠️ Chưa có lớp nào!</p>
              <p className="text-xs text-red-600 mt-1">
                Nếu file Excel có cột <strong>lop</strong>, bạn phải tạo lớp trước trong tab <strong>Lớp học</strong>.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-xs text-yellow-800">
                ⚠️ Tên lớp trong cột <code className="bg-yellow-100 px-1 rounded">lop</code> phải{' '}
                <strong>khớp chính xác</strong> với lớp đã tạo: {' '}
                {classes.map((c) => (
                  <code key={c.id} className="bg-yellow-100 px-1 rounded mr-1">{c.name}</code>
                ))}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Chọn file Excel (.xlsx)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:font-semibold hover:file:bg-teal-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Gán vào lớp{' '}
              <span className="text-gray-400 font-normal">(áp dụng khi cột "lop" trống)</span>
            </label>
            <select
              value={importClassId}
              onChange={(e) => setImportClassId(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none"
            >
              <option value="">— Không chọn —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {importRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  Đọc được <span className="text-teal-700">{importRows.length}</span> học sinh
                </p>
                <button
                  onClick={() => { setImportRows([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  ✕ Xóa
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl">
                <table className="min-w-full text-xs divide-y divide-gray-100">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">#</th>
                      <th className="px-3 py-2 text-left text-gray-500">Họ tên</th>
                      <th className="px-3 py-2 text-left text-gray-500">Tài khoản</th>
                      <th className="px-3 py-2 text-left text-gray-500">Lớp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {importRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-800">{r.name}</td>
                        <td className="px-3 py-2 font-mono text-teal-700">@{r.username}</td>
                        <td className="px-3 py-2 text-gray-500">{r.className || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleImport}
                disabled={isImporting}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Đang import...
                  </>
                ) : `📤 Import ${importRows.length} học sinh`}
              </button>
            </div>
          )}

          {importResult && (
            <div
              className={`p-4 rounded-xl border ${
                importResult.failed === 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <p className="font-semibold text-gray-800 mb-2">Kết quả Import</p>
              <p className="text-sm text-green-700">✅ Thành công: {importResult.success}</p>
              {importResult.failed > 0 && (
                <>
                  <p className="text-sm text-red-700">❌ Thất bại: {importResult.failed}</p>
                  <ul className="mt-2 space-y-1">
                    {importResult.errors.map((errMsg, i) => (
                      <li key={i} className="text-xs text-red-600">• {errMsg}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RESET PASSWORD MODAL ────────────────────────────────── */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-gray-900">🔑 Đặt lại mật khẩu</h3>
            <p className="text-sm text-gray-600">
              Tài khoản: <strong>{resetTarget.name}</strong> (@{resetTarget.username})
            </p>
            <input
              type="text"
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              placeholder="Mật khẩu mới (tối thiểu 4 ký tự)"
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-teal-500 focus:outline-none font-mono"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setResetTarget(null); setResetPwd(''); }}
                className="flex-1 py-2.5 border-2 border-gray-300 rounded-xl font-semibold hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleResetPassword}
                disabled={isResetting || resetPwd.length < 4}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition disabled:opacity-50"
              >
                {isResetting ? '...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentAccountManager;
