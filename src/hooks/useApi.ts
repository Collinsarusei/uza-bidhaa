import { useState, useCallback } from 'react';
import { AppError } from '@/lib/error-handling';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: AppError) => void;
  initialData?: T;
}

interface UseApiState<T> {
  data: T | null;
  error: AppError | null;
  isLoading: boolean;
}

export function useApi<T>(endpoint: string, options: UseApiOptions<T> = {}) {
  const [state, setState] = useState<UseApiState<T>>({
    data: options.initialData || null,
    error: null,
    isLoading: false,
  });

  const fetchData = useCallback(async (fetchOptions: RequestInit = {}) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(endpoint, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'An error occurred' }));
        throw new AppError(error.message || 'API request failed', response.status);
      }

      const data = await response.json();
      setState({ data, error: null, isLoading: false });
      options.onSuccess?.(data);
      return data;
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('An unexpected error occurred');
      setState({ data: null, error: appError, isLoading: false });
      options.onError?.(appError);
      throw appError;
    }
  }, [endpoint, options.onSuccess, options.onError]);

  const mutate = useCallback(async (data: Partial<T>, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST') => {
    return fetchData({
      method,
      body: JSON.stringify(data),
    });
  }, [fetchData]);

  return {
    ...state,
    fetchData,
    mutate,
    reset: () => setState({ data: null, error: null, isLoading: false }),
  };
}

// Specialized hooks for common operations
export function useGet<T>(endpoint: string, options: UseApiOptions<T> = {}) {
  const api = useApi<T>(endpoint, options);
  return {
    ...api,
    fetchData: () => api.fetchData({ method: 'GET' }),
  };
}

export function usePost<T>(endpoint: string, options: UseApiOptions<T> = {}) {
  const api = useApi<T>(endpoint, options);
  return {
    ...api,
    mutate: (data: Partial<T>) => api.mutate(data, 'POST'),
  };
}

export function usePut<T>(endpoint: string, options: UseApiOptions<T> = {}) {
  const api = useApi<T>(endpoint, options);
  return {
    ...api,
    mutate: (data: Partial<T>) => api.mutate(data, 'PUT'),
  };
}

export function usePatch<T>(endpoint: string, options: UseApiOptions<T> = {}) {
  const api = useApi<T>(endpoint, options);
  return {
    ...api,
    mutate: (data: Partial<T>) => api.mutate(data, 'PATCH'),
  };
}

export function useDelete<T>(endpoint: string, options: UseApiOptions<T> = {}) {
  const api = useApi<T>(endpoint, options);
  return {
    ...api,
    mutate: (data: Partial<T>) => api.mutate(data, 'DELETE'),
  };
} 