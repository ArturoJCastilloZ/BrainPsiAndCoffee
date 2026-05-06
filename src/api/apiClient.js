import { env } from '../config/env';
import { authService } from '../auth/authService';

export const apiFetch = async (path, options = {}) => {
  const token = authService.getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    authService.logout('unauthorized');
  }

  return response;
};
