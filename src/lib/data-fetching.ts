import { cache } from 'react';
import { headers } from 'next/headers';
import { AppError } from './error-handling';

export const fetchApi = cache(async (endpoint: string, options: RequestInit = {}) => {
  const headersList = headers();
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new AppError(error.message || 'API request failed', response.status);
  }

  return response.json();
});

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const headersList = headers();
  const session = headersList.get('x-session-token');
  
  if (!session) {
    throw new AppError('Unauthorized', 401);
  }

  return fetchApi(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${session}`,
    },
  });
}

export async function fetchWithAdminAuth(endpoint: string, options: RequestInit = {}) {
  const headersList = headers();
  const session = headersList.get('x-session-token');
  const role = headersList.get('x-user-role');
  
  if (!session || role !== 'ADMIN') {
    throw new AppError('Forbidden: Admin access required', 403);
  }

  return fetchApi(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${session}`,
    },
  });
}

// Server-side data fetching with error handling
export async function fetchServerData<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    return await fetchApi(endpoint, options);
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    throw error;
  }
}

// Client-side data fetching with error handling
export async function fetchClientData<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new AppError(error.message || 'API request failed', response.status);
    }

    return response.json();
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    throw error;
  }
} 