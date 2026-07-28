import axios from 'axios';

// Create a dedicated api instance with baseURL
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Shared interceptor: attach token to every request
function attachToken(config) {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

// Apply to the dedicated api instance
api.interceptors.request.use(attachToken);

// Also apply to the global default axios instance so that pages
// using `import axios from 'axios'` also get the token automatically.
axios.interceptors.request.use(attachToken);

// Global response error handler:
// 1. Normalize error field: backend returns { error: "..." } but frontend reads data.message
// 2. Handle 401: clear auth state and redirect to home (LoginPage)
function handleResponseError(error) {
  // Normalize error field: copy data.error to data.message so all frontend code works
  if (error.response && error.response.data) {
    const data = error.response.data;
    // If data is a plain object (not a Blob/ArrayBuffer), normalize the error field
    if (typeof data === 'object' && !(data instanceof Blob) && !(data instanceof ArrayBuffer)) {
      if (data.error && !data.message) {
        data.message = data.error;
      }
    }
  }

  // Handle 401: clear auth state and redirect to home (LoginPage)
  if (error.response?.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.replace('/');
  }

  return Promise.reject(error);
}

api.interceptors.response.use((response) => response, handleResponseError);
axios.interceptors.response.use((response) => response, handleResponseError);

export default api;
