import React, { useState, useEffect } from 'react';
import { User, Role } from '../types';
import { 
  signInWithRedirect, 
  signInWithPopup,
  getRedirectResult,
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth, db, doc, getDoc, setDoc, onSnapshot } from '../services/firebaseService';

interface LoginProps {
  onLogin: (user: User) => void;
}

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

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<any>(null);
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
    console.log("🌐 Current domain:", window.location.hostname);
    console.log("🌐 Full URL:", window.location.href);
    console.log("🌐 Is WebView:", webView);
    console.log("🌐 User Agent:", navigator.userAgent);
  }, []);

  // Kiểm tra redirect result khi trang load
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log("✅ Redirect result:", result);
          await handleUserCreation(result.user);
        }
      } catch (error: any) {
        console.error("Redirect error:", error);
        if (error.code === 'auth/unauthorized-domain') {
          alert(`❌ Domain chưa được phê duyệt: ${window.location.hostname}\n\nHãy thêm domain này vào Firebase Console → Authentication → Settings → Authorized domains`);
        }
      }
    };
    checkRedirectResult();
  }, []);

  const handleUserCreation = async (user: any) => {
    const displayName = user.displayName || 'Học sinh';
    const email = user.email || '';
    const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0d9488&color=fff`;

    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        id: user.uid,
        name: displayName,
        email: email,
        avatar: photoURL,
        role: Role.MEMBER,
        isApproved: false,
        createdAt: new Date()
      });
      setCurrentUserData({ name: displayName, email });
    } else {
      setCurrentUserData({ 
        name: userDoc.data().name, 
        email: userDoc.data().email 
      });
    }

    setIsPending(true);
  };

  const handleGoogleSignIn = async () => {
    // ✅ Double check WebView trước khi đăng nhập
    if (isWebView()) {
      setInWebView(true);
      setWebViewType(getWebViewType());
      return;
    }

    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      
      // Thử popup trước
      try {
        console.log("🔄 Trying popup sign-in...");
        const result = await signInWithPopup(auth, provider);
        await handleUserCreation(result.user);
        setLoading(false);
      } catch (popupError: any) {
        console.log("❌ Popup failed, trying redirect...", popupError);
        
        // Nếu popup fail, dùng redirect
        if (popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/popup-closed-by-user' ||
            popupError.code === 'auth/cancelled-popup-request') {
          await signInWithRedirect(auth, provider);
          // Sau redirect, page sẽ reload và useEffect checkRedirectResult sẽ xử lý
        } else {
          throw popupError;
        }
      }
    } catch (error: any) {
      console.error("Login error:", error);
      setLoading(false);
      
      if (error.code === 'auth/unauthorized-domain') {
        alert(`❌ Domain không được phép: ${window.location.hostname}\n\n` +
              `Giải pháp:\n` +
              `1. Vào Firebase Console\n` +
              `2. Authentication → Settings → Authorized domains\n` +
              `3. Thêm domain: ${window.location.hostname}`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        alert("Bạn đã đóng cửa sổ đăng nhập.");
      } else {
        alert("Có lỗi xảy ra khi đăng nhập với Google: " + error.message);
      }
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

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !isPending) return;

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      const data = snapshot.data();
      if (data && data.isApproved) {
        onLogin({
          id: data.id,
          name: data.name,
          avatar: data.avatar,
          role: data.role as Role,
          status: 'online'
        });
      }
    });

    return () => unsubscribe();
  }, [isPending, onLogin]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-500 to-teal-800 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>
          </div>
          <h1 className="text-3xl font-bold text-teal-900">StuChat</h1>
          <p className="text-gray-500 mt-2">Kết nối học tập, chia sẻ đam mê</p>
        </div>

        {/* ✅ WEBVIEW WARNING */}
        {inWebView && (
          <div className="space-y-4">
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
                    <span className="bg-teal-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                    <span>Nhấn nút <strong>"Sao chép link"</strong> bên dưới</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-teal-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                    <span>Mở trình duyệt <strong>Chrome</strong> hoặc <strong>Safari</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-teal-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
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
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
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

            {/* Open in Browser Button (Android) */}
            <button
              onClick={handleOpenInBrowser}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
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
        )}

        {/* Normal Login Form */}
        {!inWebView && !isPending && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">🔒 Đăng nhập an toàn</p>
              <p>Sử dụng tài khoản Google (Gmail) của bạn để xác thực</p>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 border-2 border-gray-300 flex items-center justify-center gap-3"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700"></div>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Đăng nhập với Google
                </>
              )}
            </button>

            <p className="text-xs text-center text-gray-400">
              Sau khi đăng nhập, Admin sẽ xét duyệt tài khoản của bạn
            </p>
          </div>
        )}

        {/* Pending State */}
        {!inWebView && isPending && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-800">Đang chờ xét duyệt...</h3>
            {currentUserData && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4 text-left">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Tên:</span> {currentUserData.name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-semibold">Email:</span> {currentUserData.email}
                </p>
              </div>
            )}
            <p className="text-gray-400 mt-4 text-sm">
              Hãy báo cho Admin hoặc chờ đợi màn hình tự động chuyển khi được duyệt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
