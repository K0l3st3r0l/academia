import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4100';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('academia_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password });

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
