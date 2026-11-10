// "Install app" support. Chrome fires beforeinstallprompt when the app can be installed;
// we keep the event so the app can offer its own Install button instead of waiting for Chrome.
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function isInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** Apps like WhatsApp, Gmail and Facebook open links in their own browser, which can't install apps. */
export function isInAppBrowser(): boolean {
  return /\bwv\b|FBAN|FBAV|Instagram|WhatsApp|GSA\//i.test(navigator.userAgent);
}

export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canPrompt: deferred != null,
    installed: isInstalled(),
    inAppBrowser: isInAppBrowser(),
    async install(): Promise<boolean> {
      if (!deferred) return false;
      const e = deferred;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      notify();
      return outcome === 'accepted';
    },
  };
}
