import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function activateWaitingWorker(worker: ServiceWorker | null | undefined) {
  worker?.postMessage({ type: 'SKIP_WAITING' });
}

function hardReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('_sw', String(Date.now()));
  window.location.replace(url.toString());
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const applyUpdate = useCallback(async () => {
    setUpdateAvailable(false);
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        activateWaitingWorker(registration?.waiting);
        // Also nudge installing worker if present.
        activateWaitingWorker(registration?.installing);
      }
    } catch (error) {
      console.warn('Failed to activate waiting service worker:', error);
    }
    // Always reload — never gate on session flags (that caused "no response").
    window.setTimeout(() => {
      hardReload();
    }, 50);
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
    }

    // Strip cache-bust query from a previous hard reload.
    const url = new URL(window.location.href);
    if (url.searchParams.has('_sw')) {
      url.searchParams.delete('_sw');
      window.history.replaceState(window.history.state, '', url.toString());
      setUpdateAvailable(false);
    }

    const markUpdateAvailable = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    };

    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      markUpdateAvailable(registration);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    };

    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          trackWaiting(registration);
          void registration.update().then(() => markUpdateAvailable(registration));
        })
        .catch((error) => {
          console.warn('PWA Service Worker registration failed:', error);
        });
    };

    if ('serviceWorker' in navigator) {
      if (document.readyState === 'complete') {
        registerServiceWorker();
      } else {
        window.addEventListener('load', registerServiceWorker);
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
    };

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('load', registerServiceWorker);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable,
    isInstalled,
    isOffline,
    updateAvailable,
    installPWA,
    applyUpdate,
    dismissUpdate,
  };
}
