export type AppToastType = 'success' | 'error' | 'info';

export type AppToastPayload = {
  message: string;
  type?: AppToastType;
  durationMs?: number;
};

export const APP_TOAST_EVENT = 'app:toast';

export function showToast(payload: AppToastPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppToastPayload>(APP_TOAST_EVENT, { detail: payload }));
}
