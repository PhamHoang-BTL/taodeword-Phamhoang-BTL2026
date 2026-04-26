import React, { useState, useEffect } from 'react';
import { User, Role, Class } from '../types';
import { 
  getAllUsers, 
  getPendingUsers, 
  approveUser, 
  rejectUser, 
  updateUserRole,
  getAllClasses,
  addStudentToClass,
  removeStudentFromClass
} from '../services/firebaseService';

interface AdminUserPanelProps {
  currentUser: User;
  onBack: () => void;
}

type Tab = 'pending-teachers' | 'pending-students' | 'all-teachers' | 'all-students';

const AdminUserPanel: React.FC<AdminUserPanelProps> = ({ currentUser, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('pending-students');
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allUsers, pending, allClasses] = await Promise.all([
        getAllUsers(),
        getPendingUsers(),
        getAllClasses()
      ]);
      setUsers(allUsers);
      setPendingUsers(pending);
      setClasses(allClasses);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await approveUser(userId);
      alert('✅ Đã phê duyệt user!');
      loadData();
    } catch (err) {
      console.error('Approve error:', err);
      alert('❌ Lỗi khi phê duyệt');
    }
  };

  const handleReject = async (userId: string, userName: string) => {
    if (!confirm(`Bạn có chắc muốn từ chối và xóa tài khoản "${userName}"?`)) return;
    
    try {
      await rejectUser(userId);
      alert('✅ Đã từ chối user!');
      loadData();
    } catch (err) {
      console.error('Reject error:', err);
      alert('❌ Lỗi khi từ chối');
    }
  };

  const handleChangeRole = async (userId: string, newRole: Role) => {
    try {
      await updateUserRole(userId, newRole);
      alert('✅ Đã cập nhật vai trò!');
      loadData();
    } catch (err) {
      console.error('Update role error:', err);
      alert('❌ Lỗi khi cập nhật');
    }
  };

  // ✅ MỚI: Thêm học sinh vào lớp
  const handleAddToClass = async (userId: string, classId: string) => {
    try {
      await addStudentToClass(classId, userId);
      alert('✅ Đã thêm học sinh vào lớp!');
      loadData();
    } catch (err) {
      console.error('Add to class error:', err);
      alert('❌ Lỗi khi thêm vào lớp');
    }
  };

  // ✅ MỚI: Xóa học sinh khỏi lớp
  const handleRemoveFromClass = async (userId: string, classId: string, className: string) => {
    if (!confirm(`Xóa học sinh khỏi lớp "${className}"?`)) return;
    
    try {
      await removeStudentFromClass(userId, classId);
      alert('✅ Đã xóa khỏi lớp!');
      loadData();
    } catch (err) {
      console.error('Remove from class error:', err);
      alert('❌ Lỗi khi xóa');
    }
  };

  // Filter users
  const pendingTeachers = pendingUsers.filter(u => u.role === Role.TEACHER || u.role === Role.ADMIN);
  const pendingStudents = pendingUsers.filter(u => u.role === Role.STUDENT);
  const allTeachers = users.filter(u => u.role !== Role.STUDENT);
  const allStudents = users.filter(u => u.role === Role.STUDENT);

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case Role.ADMIN:
      case Role.LEADER:
        return { bg: 'bg-red-100', text: 'text-red-700', label: 'Admin' };
      case Role.DEPUTY:
        return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Phó' };
      case Role.TEACHER:
        return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Giáo viên' };
      case Role.STUDENT:
        return { bg: 'bg-green-100', text: 'text-green-700', label: 'Học sinh' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Thành viên' };
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div 
        className="text-white p-4 shadow-lg"
        style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/20 rounded-lg transition"
            >
              ← Quay lại
            </button>
            <div>
              <h1 className="text-xl font-bold">👥 Quản lý Người dùng</h1>
              <p className="text-red-100 text-sm">Phê duyệt và quản lý tài khoản</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('pending-students')}
            className={`px-4 py-3 rounded-xl font-semibold transition flex items-center gap-2 ${
              activeTab === 'pending-students'
                ? 'bg-yellow-500 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⏳ Học sinh chờ duyệt
            {pendingStudents.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {pendingStudents.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setActiveTab('pending-teachers')}
            className={`px-4 py-3 rounded-xl font-semibold transition flex items-center gap-2 ${
              activeTab === 'pending-teachers'
                ? 'bg-yellow-500 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⏳ Giáo viên chờ duyệt
            {pendingTeachers.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {pendingTeachers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('all-students')}
            className={`px-4 py-3 rounded-xl font-semibold transition ${
              activeTab === 'all-students'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            🎓 Tất cả học sinh ({allStudents.length})
          </button>

          <button
            onClick={() => setActiveTab('all-teachers')}
            className={`px-4 py-3 rounded-xl font-semibold transition ${
              activeTab === 'all-teachers'
                ? 'bg-teal-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            👨‍🏫 Tất cả giáo viên ({allTeachers.length})
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Đang tải...</p>
          </div>
        ) : (
          <>
            {/* Pending Students Tab */}
            {activeTab === 'pending-students' && (
              <div className="space-y-4">
                {pendingStudents.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center">
                    <div className="text-6xl mb-4">✅</div>
                    <p className="text-gray-500">Không có học sinh chờ duyệt!</p>
                  </div>
                ) : (
                  pendingStudents.map(user => (
                    <div key={user.id} className="bg-white rounded-xl p-5 shadow-md border-l-4 border-yellow-400">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full" />
                          ) : (
                            <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h3 className="font-bold text-gray-800">{user.name}</h3>
                            <p className="text-sm text-gray-500">{user.email}</p>
                            <p className="text-xs text-gray-400">
                              Đăng ký: {user.createdAt?.toLocaleDateString('vi-VN')}
                            </p>
                            <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                              🎓 Học sinh
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(user.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                          >
                            ✓ Duyệt
                          </button>
                          <button
                            onClick={() => handleReject(user.id, user.name)}
                            className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition font-medium"
                          >
                            ✗ Từ chối
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Pending Teachers Tab */}
            {activeTab === 'pending-teachers' && (
              <div className="space-y-4">
                {pendingTeachers.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center">
                    <div className="text-6xl mb-4">✅</div>
                    <p className="text-gray-500">Không có giáo viên chờ duyệt!</p>
                  </div>
                ) : (
                  pendingTeachers.map(user => (
                    <div key={user.id} className="bg-white rounded-xl p-5 shadow-md border-l-4 border-blue-400">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full" />
                          ) : (
                            <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h3 className="font-bold text-gray-800">{user.name}</h3>
                            <p className="text-sm text-gray-500">{user.email}</p>
                            <p className="text-xs text-gray-400">
                              Đăng ký: {user.createdAt?.toLocaleDateString('vi-VN')}
                            </p>
                            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                              👨‍🏫 Giáo viên
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(user.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                          >
                            ✓ Duyệt
                          </button>
                          <button
                            onClick={() => handleReject(user.id, user.name)}
                            className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition font-medium"
                          >
                            ✗ Từ chối
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* All Students Tab */}
            {activeTab === 'all-students' && (
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Học sinh</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Email</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Lớp học</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Trạng thái</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allStudents.map(user => {
                        const userClasses = classes.filter(c => user.classIds?.includes(c.id));
                        const isCurrentUser = user.id === currentUser.id;
                        
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {user.avatar ? (
                                  <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                                ) : (
                                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                                    {user.name.charAt(0)}
                                  </div>
                                )}
                                <span className="font-medium">{user.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                            <td className="px-4 py-3 text-center">
                              {userClasses.length > 0 ? (
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {userClasses.map(cls => (
                                    <span
                                      key={cls.id}
                                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                                    >
                                      {cls.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">Chưa có lớp</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {user.isApproved ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                  ✓ Đã duyệt
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                  ⏳ Chờ duyệt
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-2 flex-wrap">
                                {/* Thêm vào lớp */}
                                <select
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleAddToClass(user.id, e.target.value);
                                      e.target.value = '';
                                    }
                                  }}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                                >
                                  <option value="">+ Thêm lớp</option>
                                  {classes
                                    .filter(c => !user.classIds?.includes(c.id))
                                    .map(cls => (
                                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))
                                  }
                                </select>

                                {/* Xóa */}
                                {!isCurrentUser && (
                                  <button
                                    onClick={() => handleReject(user.id, user.name)}
                                    className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200"
                                  >
                                    Xóa
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* All Teachers Tab */}
            {activeTab === 'all-teachers' && (
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Người dùng</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Email</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Vai trò</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Trạng thái</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allTeachers.map(user => {
                        const roleBadge = getRoleBadge(user.role);
                        const isCurrentUser = user.id === currentUser.id;
                        
                        return (
                          <tr key={user.id} className={`hover:bg-gray-50 ${isCurrentUser ? 'bg-teal-50' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {user.avatar ? (
                                  <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                                ) : (
                                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center font-bold">
                                    {user.name.charAt(0)}
                                  </div>
                                )}
                                <span className="font-medium">
                                  {user.name}
                                  {isCurrentUser && <span className="text-teal-600 text-xs ml-2">(Bạn)</span>}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                            <td className="px-4 py-3 text-center">
                              <select
                                value={user.role}
                                onChange={(e) => handleChangeRole(user.id, e.target.value as Role)}
                                disabled={isCurrentUser}
                                className={`px-3 py-1 rounded-full text-xs font-medium border-0 ${roleBadge.bg} ${roleBadge.text} ${isCurrentUser ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <option value={Role.TEACHER}>Giáo viên</option>
                                <option value={Role.ADMIN}>Admin</option>
                                <option value={Role.LEADER}>Leader</option>
                                <option value={Role.DEPUTY}>Deputy</option>
                                <option value={Role.MEMBER}>Member</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {user.isApproved ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                  ✓ Đã duyệt
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                  ⏳ Chờ duyệt
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {!isCurrentUser && (
                                <button
                                  onClick={() => handleReject(user.id, user.name)}
                                  className="px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm"
                                >
                                  Xóa
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminUserPanel;
