export function notifyToast(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>('kb:toast', { detail: message }));
}
