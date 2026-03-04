import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true
});

// Request interceptor for adding token
API.interceptors.request.use(
  (config) => {
    // Set JSON content type only for requests that actually send a body.
    const method = String(config.method || 'get').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method) && !(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const skipAutoRedirect =
      requestUrl.includes('/auth/login') || requestUrl.includes('/auth/check-session');

    if (error.response?.status === 401 && !skipAutoRedirect) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // SPA redirect (avoid full page reload)
      if (window.location.pathname !== '/login') {
        window.history.replaceState({}, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
    return Promise.reject(error);
  }
);

export default API;
