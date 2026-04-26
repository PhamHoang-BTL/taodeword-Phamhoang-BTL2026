import React, { useState, useEffect } from 'react';
import { User, Role } from './types';
import { auth, db, collection, query, onSnapshot, doc, setDoc, where } from './services/firebaseService';

interface PendingUser extends User {
  email?: string;
  isApproved: boolean;
  createdAt: Date;
}

const AdminPanel: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');

  useEffect(() => {
    // Lắng nghe realtime pending users
    const pendingQuery = query(
      collection(db, "users"),
      where("isApproved", "==", false)
    );

    const unsubPending = onSnapshot(pendingQuery, (snapshot) => {
      const users: PendingUser[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        users.push({
          id: data.id,
          name: data.name,
          email: data.email,
          avatar: data.avatar,
          role: data.role as Role,
          status: 'offline',
          isApproved: data.isApproved,
          createdAt: data.createdAt?.toDate() || new Date()
        });
      });
      setPendingUsers(users);
      setLoading(false);
    });

    // Lắng nghe realtime approved users
    const approvedQuery = query(
      collection(db, "users"),
      where("isApproved", "==", true)
    );

    const unsubApproved = onSnapshot(approvedQuery, (snapshot) => {
      const users: PendingUser[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        users.push({
          id: data.id,
          name: data.name,
          email: data.email,
          avatar: data.avatar,
          role: data.role as Role,
          status: 'online',
          isApproved: data.isApproved,
          createdAt: data.createdAt?.toDate() || new Date()
        });
      });
      setApprovedUsers(users);
    });

    return () => {
      unsubPending();
      unsubApproved();
    };
  }, []);

  const handleApprove = async (userId: string) => {
    try {
      await setDoc(doc(db, "users", userId), {
        isApproved: true
      }, { merge: true });
      alert("✅ Đã duyệt thành công!");
    } catch (error) {
      console.error("Approve error:", error);
      alert("❌ Có lỗi xảy ra khi duyệt user.");
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm("Bạn có chắc muốn từ chối/khóa user này?")) return;
    try {
      await setDoc(doc(db, "users", userId), {
        isApproved: false
      }, { merge: true });
      alert("✅ Đã từ chối/khóa!");
    } catch (error) {
      console.error("Reject error:", error);
      alert("❌ Có lỗi xảy ra.");
    }
  };

  const handleChangeRole = async (userId: string, newRole: Role) => {
    try {
      await setDoc(doc(db, "users", userId), {
        role: newRole
      }, { merge: true });
      alert(`✅ Đã đổi vai trò thành ${newRole}!`);
    } catch (error) {
      console.error("Change role error:", error);
      alert("❌ Có lỗi xảy ra khi đổi vai trò.");
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleName = (role: Role) => {
    switch (role) {
      case Role.LEADER: return 'Trưởng nhóm';
      case Role.DEPUTY: return 'Phó nhóm';
      default: return 'Thành viên';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-teal-600 text-white p-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">🛡️ Admin Panel</h1>
            <p className="text-teal-100 mt-1">Quản lý người dùng StuChat</p>
          </div>
          <button
            onClick={onBack}
            className="bg-white text-teal-600 px-4 py-2 rounded-lg font-semibold hover:bg-teal-50 transition flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Quay lại Chat
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto mt-6 px-4">
        <div className="flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 font-semibold transition relative ${
              activeTab === 'pending'
                ? 'text-teal-600 border-b-2 border-teal-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⏳ Chờ duyệt
            {pendingUsers.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                {pendingUsers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-6 py-3 font-semibold transition ${
              activeTab === 'approved'
                ? 'text-teal-600 border-b-2 border-teal-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ✅ Đã duyệt ({approvedUsers.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto mt-6 px-4 pb-10">
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Đang tải dữ liệu...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending Users Tab */}
            {activeTab === 'pending' && pendingUsers.length === 0 && (
              <div className="text-center py-20 bg-white rounded-xl shadow">
                <div className="text-6xl mb-4">✅</div>
                <p className="text-gray-400 text-lg font-semibold">Không có user nào chờ duyệt</p>
                <p className="text-gray-400 text-sm mt-2">Tất cả yêu cầu đã được xử lý</p>
              </div>
            )}

            {activeTab === 'pending' && pendingUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-between hover:shadow-md transition border-l-4 border-yellow-400">
                <div className="flex items-center gap-4">
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="w-16 h-16 rounded-full border-2 border-yellow-200 object-cover" 
                  />
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{user.name}</h3>
                    <p className="text-sm text-teal-600 font-medium">{user.email || 'Không có email'}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      📅 Đăng ký lúc: {formatDate(user.createdAt)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      🆔 ID: {user.id.substring(0, 12)}...
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(user.id)}
                    className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-semibold transition transform hover:scale-105 shadow-md"
                  >
                    ✓ Duyệt
                  </button>
                  <button
                    onClick={() => handleReject(user.id)}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-semibold transition transform hover:scale-105 shadow-md"
                  >
                    ✗ Từ chối
                  </button>
                </div>
              </div>
            ))}

            {/* Approved Users Tab */}
            {activeTab === 'approved' && approvedUsers.length === 0 && (
              <div className="text-center py-20 bg-white rounded-xl shadow">
                <div className="text-6xl mb-4">👥</div>
                <p className="text-gray-400 text-lg font-semibold">Chưa có user nào được duyệt</p>
              </div>
            )}

            {activeTab === 'approved' && approvedUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-between hover:shadow-md transition border-l-4 border-green-400">
                <div className="flex items-center gap-4">
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="w-16 h-16 rounded-full border-2 border-green-200 object-cover" 
                  />
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{user.name}</h3>
                    <p className="text-sm text-teal-600 font-medium">{user.email || 'Không có email'}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      👤 Vai trò: <span className="font-semibold text-teal-700">{getRoleName(user.role)}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      📅 Tham gia: {formatDate(user.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={user.role}
                    onChange={(e) => handleChangeRole(user.id, e.target.value as Role)}
                    className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium"
                  >
                    <option value={Role.MEMBER}>👤 Thành viên</option>
                    <option value={Role.DEPUTY}>🎖️ Phó nhóm</option>
                    <option value={Role.LEADER}>👑 Trưởng nhóm</option>
                  </select>
                  <button
                    onClick={() => handleReject(user.id)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition font-medium"
                    title="Khóa tài khoản"
                  >
                    🔒 Khóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            📊 <span className="font-semibold">Thống kê:</span> 
            <span className="ml-2 text-yellow-600 font-bold">{pendingUsers.length} chờ duyệt</span>
            <span className="mx-2">•</span>
            <span className="text-green-600 font-bold">{approvedUsers.length} đã duyệt</span>
          </div>
          <div className="text-xs text-gray-400">
            Admin: {auth.currentUser?.displayName || auth.currentUser?.email}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
