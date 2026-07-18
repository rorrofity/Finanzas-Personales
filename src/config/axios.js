import axios from 'axios';
import {
  getActiveSpaceOwner,
  SPACE_FORBIDDEN_EVENT,
} from '../services/activeSpace';

// Configurar la URL base para todas las peticiones
// Por defecto dejamos relativo para que en desarrollo use el proxy de CRA
// y en producción se pueda inyectar via REACT_APP_API_BASE_URL
const apiBase = process.env.REACT_APP_API_BASE_URL || '';
axios.defaults.baseURL = apiBase;

// Configurar interceptores para manejar tokens y espacio activo (Epic 11)
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Espacio compartido: header X-Space-Owner cuando no es el propio
    const spaceOwner = getActiveSpaceOwner();
    if (spaceOwner) {
      config.headers['X-Space-Owner'] = spaceOwner;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Revocación en vivo: membresía inexistente/inactiva → volver al espacio propio
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'SPACE_FORBIDDEN'
    ) {
      window.dispatchEvent(new CustomEvent(SPACE_FORBIDDEN_EVENT));
    }
    return Promise.reject(error);
  }
);

export default axios;
