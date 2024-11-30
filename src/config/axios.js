import axios from 'axios';

// Configurar la URL base para todas las peticiones
axios.defaults.baseURL = 'http://localhost:3001';

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
