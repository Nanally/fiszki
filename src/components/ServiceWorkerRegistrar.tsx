'use client';

import { useEffect } from 'react';

const SW_PATH = '/sw.js';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]'
    );

    if (window.location.protocol !== 'https:' && !isLocalhost) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
        if (process.env.NODE_ENV !== 'production') {
          console.info('Service worker registered:', registration.scope);
        }
      } catch (error) {
        console.error('Nie udało się zarejestrować service workera', error);
      }
    };

    void register();
  }, []);

  return null;
}

export default ServiceWorkerRegistrar;
