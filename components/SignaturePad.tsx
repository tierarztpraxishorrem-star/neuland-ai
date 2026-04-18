'use client';

import { useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';

type SignaturePadProps = {
  onSave: (dataUrl: string) => void;
  onClear?: () => void;
};

export default function SignaturePad({ onSave, onClear }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas | null>(null);

  const handleEnd = useCallback(() => {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const dataUrl = sigRef.current.toDataURL('image/png');
    onSave(dataUrl);
  }, [onSave]);

  const handleClear = useCallback(() => {
    sigRef.current?.clear();
    onClear?.();
  }, [onClear]);

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          border: '2px solid #0f6b74',
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#fff',
          touchAction: 'none',
        }}
      >
        <SignatureCanvas
          ref={sigRef}
          penColor="#1f2937"
          canvasProps={{
            style: { width: '100%', height: '160px', display: 'block' },
          }}
          onEnd={handleEnd}
        />
      </div>
      <button
        type="button"
        onClick={handleClear}
        style={{
          marginTop: '8px',
          padding: '6px 14px',
          fontSize: '13px',
          color: '#64748b',
          background: 'transparent',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        Unterschrift löschen
      </button>
    </div>
  );
}
