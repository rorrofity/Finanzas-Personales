import axios from 'axios';

// Configurar la URL base para todas las peticiones
// Por defecto dejamos relativo para que en desarrollo use el proxy de CRA
// y en producción se pueda inyectar via REACT_APP_API_BASE_URL
const apiBase = process.env.REACT_APP_API_BASE_URL || '';
axios.defaults.baseURL = apiBase;

// Configurar interceptores para manejar tokens
axios.interceptors.request.use(
  (config) => {
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

export default axios;
