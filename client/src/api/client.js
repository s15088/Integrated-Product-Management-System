import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

function attachToken(config) {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

api.interceptors.request.use(attachToken);
axios.interceptors.request.use(attachToken);

function handleResponseError(error) {
  if (error.response && error.response.data) {
    const data = error.response.data;
    if (typeof data === 'object' && !(data instanceof Blob) && !(data instanceof ArrayBuffer)) {
      if (data.error && !data.message) {
        data.message = data.error;
      }
    }
  }
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
