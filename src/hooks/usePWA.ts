import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SW_RELOAD_FLAG = 'daily_todos_sw_reloading';

function activateWaitingWorker(worker: ServiceWorker | null | undefined) {
  worker?.postMessage({ type: 'SKIP_WAITING' });
}

/** Activate waiting worker and reload once (guarded against loops). */
function activateWaitingAndReload(worker: ServiceWorker) {
  if (sessionStorage.getItem(SW_RELOAD_FLAG) === '1') return;
  sessionStorage.setItem(SW_RELOAD_FLAG, '1');
  activateWaitingWorker(worker);
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const applyUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      activateWaitingAndReload(registration.waiting);
      return;
    }
    sessionStorage.setItem(SW_RELOAD_FLAG, '1');
    window.location.reload();
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

    // Finished a one-shot SW reload — clear sticky "update available" state.
    if (sessionStorage.getItem(SW_RELOAD_FLAG)) {
      sessionStorage.removeItem(SW_RELOAD_FLAG);
      setUpdateAvailable(false);
    }

    const handleControllerChange = () => {
      if (sessionStorage.getItem(SW_RELOAD_FLAG) === '1') {
        window.location.reload();
        return;
      }
      setUpdateAvailable(false);
    };

    const takeWaitingUpdate = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
        activateWaitingAndReload(registration.waiting);
      }
    };

    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      takeWaitingUpdate(registration);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
            if (registration.waiting) {
              activateWaitingAndReload(registration.waiting);
            }
          }
        });
      });
    };

    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          trackWaiting(registration);
          void registration.update().then(() => takeWaitingUpdate(registration));
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
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
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
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
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
