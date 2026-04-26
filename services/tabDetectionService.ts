/**
 * Tab Detection Service - Phát hiện và xử lý chuyển tab/cửa sổ
 * 
 * Features:
 * - Theo dõi khi học sinh chuyển tab/window
 * - Cảnh báo lần đầu
 * - Tự động nộp bài ở lần thứ 2
 * - Block F12/DevTools
 */

export type TabSwitchCallback = (switchCount: number, warnings: Date[]) => void;
export type AutoSubmitCallback = () => void;

export class TabDetectionService {
  private switchCount: number = 0;
  private warnings: Date[] = [];
  private isActive: boolean = false;
  
  private onTabSwitch?: TabSwitchCallback;
  private onAutoSubmit?: AutoSubmitCallback;
  
  constructor() {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }

  /**
   * Khởi động service theo dõi
   */
  start(callbacks: {
    onTabSwitch?: TabSwitchCallback;
    onAutoSubmit?: AutoSubmitCallback;
  }) {
    if (this.isActive) return;
    
    this.onTabSwitch = callbacks.onTabSwitch;
    this.onAutoSubmit = callbacks.onAutoSubmit;
    this.isActive = true;

    // Theo dõi visibility change
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Theo dõi window blur
    window.addEventListener('blur', this.handleBlur);
    
    // Block phím tắt
    document.addEventListener('keydown', this.handleKeyDown);
    
    // Block right click
    document.addEventListener('contextmenu', this.handleContextMenu);

    console.log('🔒 Tab Detection Service started');
  }

  /**
   * Dừng service
   */
  stop() {
    if (!this.isActive) return;
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('contextmenu', this.handleContextMenu);
    
    this.isActive = false;
    console.log('🔓 Tab Detection Service stopped');
  }

  /**
   * Xử lý khi tab bị ẩn
   */
  private handleVisibilityChange() {
    if (document.hidden) {
      this.recordSwitch();
    }
  }

  /**
   * Xử lý khi window mất focus
   */
  private handleBlur() {
    // Chỉ record nếu thực sự chuyển tab (không phải click vào DevTools)
    setTimeout(() => {
      if (document.hidden) {
        this.recordSwitch();
      }
    }, 100);
  }

  /**
   * Block các phím tắt nguy hiểm
   */
  private handleKeyDown(e: KeyboardEvent) {
    // Block F12
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }

    // Block Ctrl+Shift+I (DevTools)
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return false;
    }

    // Block Ctrl+Shift+J (Console)
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      return false;
    }

    // Block Ctrl+U (View Source)
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      return false;
    }

    // Block Ctrl+Shift+C (Inspect Element)
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return false;
    }
  }

  /**
   * Block right click
   */
  private handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    return false;
  }

  /**
   * Ghi nhận một lần chuyển tab
   */
  private recordSwitch() {
    if (!this.isActive) return;

    this.switchCount++;
    const now = new Date();
    this.warnings.push(now);

    console.warn(`⚠️ Tab switch detected! Count: ${this.switchCount}`);

    // Callback
    if (this.onTabSwitch) {
      this.onTabSwitch(this.switchCount, [...this.warnings]);
    }

    // Lần thứ 2 -> tự động nộp bài
    if (this.switchCount >= 2) {
      console.error('🚨 AUTO SUBMIT - Too many tab switches!');
      if (this.onAutoSubmit) {
        this.onAutoSubmit();
      }
    }
  }

  /**
   * Lấy thông tin hiện tại
   */
  getStats() {
    return {
      switchCount: this.switchCount,
      warnings: [...this.warnings],
      isActive: this.isActive
    };
  }

  /**
   * Reset counter (chỉ dùng khi test)
   */
  reset() {
    this.switchCount = 0;
    this.warnings = [];
  }
}

// Singleton instance
let instance: TabDetectionService | null = null;

export const getTabDetectionService = (): TabDetectionService => {
  if (!instance) {
    instance = new TabDetectionService();
  }
  return instance;
};
