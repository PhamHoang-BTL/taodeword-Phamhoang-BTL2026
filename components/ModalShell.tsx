import React, { useEffect } from 'react';

type ModalShellProps = {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  /** max width tailwind class, ví dụ: "max-w-md", "max-w-3xl", "max-w-2xl"... */
  maxWidthClass?: string;
  /** tắt đóng khi click nền */
  disableBackdropClose?: boolean;
};

const ModalShell: React.FC<ModalShellProps> = ({
  open,
  onClose,
  children,
  maxWidthClass = 'max-w-3xl',
  disableBackdropClose = false
}) => {
  // Lock body scroll when modal open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open || !onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 overflow-y-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}
      onMouseDown={(e) => {
        if (disableBackdropClose) return;
        // chỉ đóng khi bấm đúng nền (không đóng khi bấm trong modal)
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/* padding trên/dưới đủ để không “kẹt giữa” và vẫn scroll được */}
      <div className="min-h-full flex items-start justify-center p-4 sm:p-6 py-10">
        <div className={`w-full ${maxWidthClass}`}>
          {/* chặn sự kiện mouseDown lan ra nền */}
          <div onMouseDown={(e) => e.stopPropagation()}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export default ModalShell;
