import React, { useState, useEffect } from 'react';
import { signInWithGoogle, signInStudentWithGoogle } from '../services/firebaseService';
import { User } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

type LoginMode = null | 'student' | 'teacher';

// ✅ Detect WebView (Facebook, Zalo, Messenger, Instagram, TikTok...)
const isWebView = (): boolean => {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  
  // Facebook
  if (ua.includes('FBAN') || ua.includes('FBAV')) return true;
  
  // Instagram
  if (ua.includes('Instagram')) return true;
  
  // Zalo
  if (ua.includes('Zalo')) return true;
  
  // Messenger
  if (ua.includes('Messenger')) return true;
  
  // TikTok
  if (ua.includes('TikTok') || ua.includes('musical_ly')) return true;
  
  // LINE
  if (ua.includes('Line/')) return true;
  
  // Twitter/X
  if (ua.includes('Twitter')) return true;
  
  // Snapchat
  if (ua.includes('Snapchat')) return true;
  
  // WeChat
  if (ua.includes('MicroMessenger')) return true;
  
  // Generic WebView detection
  // Android WebView
  if (ua.includes('wv') && ua.includes('Android')) return true;
  
  // iOS WebView (không phải Safari)
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  if (isIOS && !isSafari && !ua.includes('Chrome')) return true;
  
  return false;
};

// ✅ Detect loại WebView để hiển thị hướng dẫn phù hợp
const getWebViewType = (): string => {
  const ua = navigator.userAgent || '';
  
  if (ua.includes('FBAN') || ua.includes('FBAV')) return 'Facebook';
  if (ua.includes('Instagram')) return 'Instagram';
  if (ua.includes('Zalo')) return 'Zalo';
  if (ua.includes('Messenger')) return 'Messenger';
  if (ua.includes('TikTok') || ua.includes('musical_ly')) return 'TikTok';
  if (ua.includes('Line/')) return 'LINE';
  if (ua.includes('Twitter')) return 'Twitter/X';
  if (ua.includes('MicroMessenger')) return 'WeChat';
  
  return 'ứng dụng này';
};

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<LoginMode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inWebView, setInWebView] = useState(false);
  const [webViewType, setWebViewType] = useState('');
  const [copied, setCopied] = useState(false);

  // ✅ Check WebView on mount
  useEffect(() => {
    const webView = isWebView();
    setInWebView(webView);
    if (webView) {
      setWebViewType(getWebViewType());
    }
    console.log("🌐 Is WebView:", webView);
    console.log("🌐 User Agent:", navigator.userAgent);
  }, []);

  const handleStudentLogin = async () => {
    // ✅ Double check WebView trước khi đăng nhập
    if (isWebView()) {
      setInWebView(true);
      setWebViewType(getWebViewType());
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const user = await signInStudentWithGoogle();
      if (user) {
        onLoginSuccess(user);
      }
    } catch (err: any) {
      // ✅ Check for WebView error
      if (err.message?.includes('disallowed_useragent') || 
          err.code === 'auth/web-storage-unsupported') {
        setInWebView(true);
        setWebViewType(getWebViewType());
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeacherLogin = async () => {
    // ✅ Double check WebView trước khi đăng nhập
    if (isWebView()) {
      setInWebView(true);
      setWebViewType(getWebViewType());
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        onLoginSuccess(user);
      }
    } catch (err: any) {
      // ✅ Check for WebView error
      if (err.message?.includes('disallowed_useragent') || 
          err.code === 'auth/web-storage-unsupported') {
        setInWebView(true);
        setWebViewType(getWebViewType());
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Copy link to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback cho các trình duyệt cũ
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ✅ Open in external browser (Android)
  const handleOpenInBrowser = () => {
    const url = window.location.href;
    
    // Thử mở bằng intent cho Android
    const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
    window.location.href = intentUrl;
    
    // Fallback: Hiển thị hướng dẫn
    setTimeout(() => {
      alert('Nếu không tự động mở được, hãy:\n\n1. Copy link bằng nút "Sao chép link"\n2. Mở trình duyệt Chrome/Safari\n3. Dán link vào thanh địa chỉ');
    }, 500);
  };

  // ✅ WebView Warning Screen
  if (inWebView) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo/Header */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">📚</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Hệ thống Thi Trực tuyến</h1>
          </div>

          {/* WebView Warning */}
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">⚠️</span>
                <h3 className="text-lg font-bold text-orange-800">
                  Không thể đăng nhập
                </h3>
              </div>
              
              <p className="text-orange-700 text-sm mb-4">
                Bạn đang mở trang này trong <strong>{webViewType}</strong>. 
                Google không cho phép đăng nhập từ trình duyệt nhúng vì lý do bảo mật.
              </p>

              <div className="bg-white rounded-lg p-4 border border-orange-200">
                <p className="font-semibold text-gray-800 mb-3">
                  📱 Hãy mở bằng trình duyệt thực:
                </p>
                <ol className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                    <span>Nhấn nút <strong>"Sao chép link"</strong> bên dưới</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                    <span>Mở trình duyệt <strong>Chrome</strong> hoặc <strong>Safari</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                    <span><strong>Dán link</strong> vào thanh địa chỉ và truy cập</span>
                  </li>
                </ol>
              </div>
            </div>

            {/* Copy Link Button */}
            <button
              onClick={handleCopyLink}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                copied 
                  ? 'bg-green-500 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Đã sao chép!
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Sao chép link
                </>
              )}
            </button>

            {/* Open in Browser Button */}
            <button
              onClick={handleOpenInBrowser}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Mở bằng trình duyệt
            </button>

            {/* Link display */}
            <div className="bg-gray-100 rounded-lg p-3 break-all text-xs text-gray-600 font-mono">
              {window.location.href}
            </div>

            {/* Retry button */}
            <button
              onClick={() => setInWebView(false)}
              className="w-full text-gray-500 text-sm underline"
            >
              Thử đăng nhập lại
            </button>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-gray-500 text-sm">
            <p>© 2026 Hệ thống Thi Trực tuyến</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📚</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Hệ thống Thi Trực tuyến</h1>
          <p className="text-gray-600">Chọn vai trò của bạn để tiếp tục</p>
        </div>

        {/* Mode Selection */}
        {mode === null && (
          <div className="space-y-4">
            {/* Student Login Button */}
            <button
              onClick={() => setMode('student')}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-2xl mb-2">🎓</div>
              <div className="text-lg">Học sinh</div>
              <div className="text-sm opacity-90">Tham gia làm bài thi</div>
            </button>

            {/* Teacher Login Button */}
            <button
              onClick={() => setMode('teacher')}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-2xl mb-2">👨‍🏫</div>
              <div className="text-lg">Giáo viên</div>
              <div className="text-sm opacity-90">Tạo và quản lý bài thi</div>
            </button>

            {/* Admin Login Button */}
            <button
              onClick={() => setMode('teacher')}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-red-400 to-red-600 hover:from-red-500 hover:to-red-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-2xl mb-2">👨‍💼</div>
              <div className="text-lg">Quản lý (Admin)</div>
              <div className="text-sm opacity-90">Quản lý hệ thống</div>
            </button>
          </div>
        )}

        {/* Confirmation & Login */}
        {mode === 'student' && (
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">🎓</div>
              <h2 className="text-2xl font-bold text-gray-800">Đăng nhập làm Học sinh</h2>
              <p className="text-gray-600 mt-2">
                Bạn sẽ tham gia làm bài thi với vai trò học sinh
              </p>
            </div>

            <button
              onClick={handleStudentLogin}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <span>🔐</span>
                  Đăng nhập với Google
                </>
              )}
            </button>

            <button
              onClick={() => {
                setMode(null);
                setError(null);
              }}
              disabled={isLoading}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50"
            >
              ← Quay lại
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                ❌ {error}
              </div>
            )}
          </div>
        )}

        {mode === 'teacher' && (
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">👨‍🏫</div>
              <h2 className="text-2xl font-bold text-gray-800">Đăng nhập làm Giáo viên</h2>
              <p className="text-gray-600 mt-2">
                Bạn sẽ có quyền tạo, quản lý bài thi và xem kết quả
              </p>
            </div>

            <button
              onClick={handleTeacherLogin}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <span>🔐</span>
                  Đăng nhập với Google
                </>
              )}
            </button>

            <button
              onClick={() => {
                setMode(null);
                setError(null);
              }}
              disabled={isLoading}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50"
            >
              ← Quay lại
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                ❌ {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 text-sm">
          <p>© 2026 Hệ thống Thi Trực tuyến. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
