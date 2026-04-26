import React from 'react';
import { User } from '../types';
import { signOutUser } from '../services/firebaseService';

interface PendingApprovalProps {
  user: User;
  onLogout: () => void;
}

const PendingApproval: React.FC<PendingApprovalProps> = ({ user, onLogout }) => {
  const handleLogout = async () => {
    await signOutUser();
    onLogout();
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%)' }}
    >
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
          {/* Icon */}
          <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">⏳</span>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Đang chờ phê duyệt
          </h1>
          
          <p className="text-gray-600 mb-6">
            Tài khoản của bạn đang chờ quản trị viên phê duyệt. 
            Vui lòng đợi hoặc liên hệ admin để được hỗ trợ.
          </p>

          {/* User Info */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-4">
              {user.avatar ? (
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="w-14 h-14 rounded-full"
                />
              ) : (
                <div className="w-14 h-14 bg-teal-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-left">
                <p className="font-semibold text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
            <span className="text-yellow-600 font-medium">Trạng thái: Chờ duyệt</span>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl font-semibold text-white transition"
              style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
            >
              🔄 Kiểm tra lại
            </button>
            
            <button
              onClick={handleLogout}
              className="w-full py-3 rounded-xl font-semibold text-gray-600 border-2 border-gray-300 hover:bg-gray-50 transition"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Help text */}
        <p className="text-center text-teal-600 mt-6 text-sm">
          Nếu bạn là giáo viên, hãy liên hệ quản trị viên để được phê duyệt nhanh hơn.
        </p>
      </div>
    </div>
  );
};

export default PendingApproval;
