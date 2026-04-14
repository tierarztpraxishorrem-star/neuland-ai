'use client';

import { useEffect, useMemo, useState } from 'react';
import { APP_TOAST_EVENT, type AppToastPayload, type AppToastType } from '@/lib/toast';

type ToastState = {
  message: string;
  type: AppToastType;
};

export default function ToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;

    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToastPayload>).detail;
      if (!detail?.message) return;

      setToast({
        message: detail.message,
        type: detail.type || 'info',
      });

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        setToast(null);
      }, detail.durationMs ?? 2800);
    };

    window.addEventListener(APP_TOAST_EVENT, handleToast as EventListener);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    };
  }, []);

  const background = useMemo(() => {
    if (!toast) return '#0f172a';
    if (toast.type === 'success') return '#166534';
    if (toast.type === 'error') return '#b91c1c';
    return '#0f172a';
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9999,
        maxWidth: 360,
        padding: '10px 14px',
        borderRadius: 10,
        color: '#fff',
        background,
        boxShadow: '0 10px 25px rgba(2, 6, 23, 0.35)',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {toast.message}
    </div>
  );
}
