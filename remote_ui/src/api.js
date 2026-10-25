import axios from 'axios';

export const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

const TOKEN_KEY = 'mirrorial.accessToken';
export const AUTH_REQUIRED_EVENT = 'mirrorial-auth-required';

export const getStoredToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch (error) {
    return '';
  }
};

export const storeToken = (token) => {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch (error) {
    // Storage can be unavailable (private mode); the token then only lives for this session via the header below.
  }
};

// Origin of the backend that serves /api (differs from the page origin in dev).
export const getBackendOrigin = () => (API_BASE.startsWith('http') ? new URL(API_BASE).origin : window.location.origin);

let interceptorsInstalled = false;

// Adds the stored access token to every request and tells the UI when the backend demands a login.
export const installAuthInterceptors = () => {
  if (interceptorsInstalled) {
    return;
  }
  interceptorsInstalled = true;

  axios.interceptors.request.use((request) => {
    const token = getStoredToken();
    if (token && !request.headers?.Authorization) {
      request.headers = request.headers || {};
      request.headers.Authorization = `Bearer ${token}`;
    }
    return request;
  });

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && error.response?.data?.authRequired !== undefined) {
        window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
      } else if (error.response?.status === 401 && /access token/i.test(error.response?.data?.error || '')) {
        storeToken('');
        window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
      }
      return Promise.reject(error);
    },
  );
};

export const fetchSecurityStatus = async (token = getStoredToken()) => {
  const response = await axios.get(`${API_BASE}/security/status`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
};
