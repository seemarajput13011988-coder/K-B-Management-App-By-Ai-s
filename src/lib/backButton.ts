import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export function registerBackButton(handler: () => boolean) {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  let disposed = false;
  let subscription: { remove: () => Promise<void> } | null = null;
  void NativeApp.addListener('backButton', ({ canGoBack }) => {
    const handled = handler();
    if (!handled && !canGoBack) void NativeApp.exitApp();
  }).then(listener => {
    if (disposed) void listener.remove();
    else subscription = listener;
  });
  return () => {
    disposed = true;
    if (subscription) void subscription.remove();
    subscription = null;
  };
}
