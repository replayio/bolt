import { useCallback } from 'react';
import { toast as toastify } from 'react-toastify';

interface ToastOptions {
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export function useToast() {
  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'info', duration = 3000 } = options;

    toastify[type](message, {
      position: 'bottom-right',
      autoClose: duration,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'dark',
    });
  }, []);

  const success = useCallback(
    (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
      toast(message, { ...options, type: 'success' });
    },
    [toast],
  );

  const error = useCallback(
    (message: string, options: Omit<ToastOptions, 'type'> = {}) => {
      toast(message, { ...options, type: 'error' });
    },
    [toast],
  );

  return { toast, success, error };
}
