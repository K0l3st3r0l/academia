import axios from 'axios';
import { getStudentToken } from './studentAuth';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4100';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('academia_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Instancia separada para alumnos: usa su propio token (academia_student_token)
// en vez del token de docente, para que ambas sesiones puedan convivir en el mismo navegador.
const studentClient = axios.create({ baseURL: API_URL });

studentClient.interceptors.request.use((config) => {
  const token = getStudentToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password });

export const studentLogin = (rut, pin) =>
  client.post('/api/auth/student-login', { rut, pin });

export const getStudentMe = () =>
  studentClient.get('/api/auth/student-me');

export const getCharacterCatalog = () =>
  studentClient.get('/api/characters/catalog');

export const getCharacterMe = () =>
  studentClient.get('/api/characters/me');

export const saveCharacter = (layers) =>
  studentClient.put('/api/characters/me', { layers });

export const getStudentsByCourse = (courseName) =>
  client.get('/api/students', { params: { course_name: courseName } });

export const resetStudentPin = (id) =>
  client.post(`/api/students/${id}/reset-pin`);

export const resetStudentPinsBulk = (courseName) =>
  client.post('/api/students/reset-pins-bulk', { course_name: courseName });

export const getRoom = (code) =>
  client.get(`/api/rooms/${code}`);

export const createRoom = (courseName, subject) =>
  client.post('/api/rooms', { course_name: courseName, subject });

export const getCourses = () =>
  client.get('/api/rooms/meta/courses');

export const getRoomHistory = () =>
  client.get('/api/rooms/history');

export const closeRoom = (id) =>
  client.post(`/api/rooms/${id}/close`);

export const getSessionDetail = (id) =>
  client.get(`/api/sessions/${id}`);

export const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:4100';

export default client;
