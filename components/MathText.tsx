import React, { useEffect, useRef, memo } from 'react';

/**
 * MathText - Component render LaTeX và GIỮ NGUYÊN output
 * 
 * Trick: Dùng ref để set innerHTML trực tiếp, không để React control
 * → MathJax output KHÔNG bị ghi đè khi parent re-render (timer, state change...)
 * 
 * Sử dụng:
 * <MathText html={question.text} className="text-gray-800" block />
 * <MathText html={option.text} className="text-sm" />
 */

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
      typesetClear?: (elements?: HTMLElement[]) => void;
    };
  }
}

interface MathTextProps {
  html: string;
  className?: string;
  block?: boolean;
}

const MathText: React.FC<MathTextProps> = ({ html, className = '', block = false }) => {
  const ref = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const contentHash = useRef('');

  useEffect(() => {
    if (!ref.current) return;
    
    // Chỉ update nếu content thay đổi
    const newHash = html || '';
    if (initialized.current && contentHash.current === newHash) {
      return; // Đã render rồi, skip để giữ MathJax output
    }
    
    // Set innerHTML trực tiếp qua ref (KHÔNG dùng dangerouslySetInnerHTML)
    ref.current.innerHTML = newHash;
    contentHash.current = newHash;
    
    // Typeset MathJax
    const timer = setTimeout(() => {
      if (ref.current && window.MathJax?.typesetPromise) {
        // Clear trước để tránh duplicate
        window.MathJax.typesetClear?.([ref.current]);
        
        window.MathJax.typesetPromise([ref.current])
          .then(() => {
            initialized.current = true;
          })
          .catch(err => console.error('MathText typeset error:', err));
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [html]);

  // Render element TRỐNG - content được set qua ref
  const Tag = block ? 'div' : 'span';
  return <Tag ref={ref as any} className={className} />;
};

export default memo(MathText);
