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

// The name only counts on creation; afterwards it changes with renameCharacter.
export const saveCharacter = (layers, name) =>
  studentClient.put('/api/characters/me', { layers, name });

export const renameCharacter = (name) =>
  studentClient.put('/api/characters/me/name', { name });

export const buyCharacterItem = (itemId) =>
  studentClient.post(`/api/characters/me/items/${itemId}`);

export const getCharacterStats = () =>
  studentClient.get('/api/characters/me/stats');

export const getCharacterNames = (status) =>
  client.get('/api/characters/names', { params: { status } });

export const reviewCharacterName = (studentId, status) =>
  client.patch(`/api/characters/names/${studentId}`, { status });

export const getStudentsByCourse = (courseName) =>
  client.get('/api/students', { params: { course_name: courseName } });

export const resetStudentPin = (id) =>
  client.post(`/api/students/${id}/reset-pin`);

export const resetStudentPinsBulk = (courseName) =>
  client.post('/api/students/reset-pins-bulk', { course_name: courseName });

export const getCurriculum = (gradeLevel, subject) =>
  client.get(`/api/curriculum/${gradeLevel}/${subject}`);

export const getQuestions = (params) =>
  client.get('/api/questions', { params });

export const getQuestionSummary = () =>
  client.get('/api/questions/summary');

export const createQuestion = (question) =>
  client.post('/api/questions', question);

export const updateQuestion = (id, question) =>
  client.put(`/api/questions/${id}`, question);

export const reviewQuestion = (id, decision, note) =>
  client.patch(`/api/questions/${id}/review`, { decision, note });

export const toggleQuestion = (id) =>
  client.patch(`/api/questions/${id}/toggle`);

export const deleteQuestion = (id) =>
  client.delete(`/api/questions/${id}`);

export const getRoom = (code) =>
  client.get(`/api/rooms/${code}`);

export const getOpenRooms = () =>
  client.get('/api/rooms/open');

export const joinRoom = (code, rut) =>
  client.post(`/api/rooms/${code}/join`, { rut });

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

export const getAuthConfig = () =>
  client.get('/api/auth/config');

export const studentEmailLogin = (email, password) =>
  client.post('/api/auth/student-email-login', { email, password });

export const requestPasswordLink = (email) =>
  client.post('/api/student-account/olvide', { email });

export const checkPasswordLink = (token) =>
  client.post('/api/student-account/enlace', { token });

export const createStudentPassword = (token, password) =>
  client.post('/api/student-account/crear', { token, password });

export const getPetCatalog = () =>
  studentClient.get('/api/pets/catalog');

export const getPetMe = () =>
  studentClient.get('/api/pets/me');

export const adoptPet = (species, name) =>
  studentClient.post('/api/pets/me', { species, name });

export const changePetSpecies = (species) =>
  studentClient.put('/api/pets/me/species', { species });

export const renamePet = (name) =>
  studentClient.put('/api/pets/me/name', { name });

// Records that the student already saw the pet's current stage (the growth is celebrated once).
export const markPetSeen = () =>
  studentClient.post('/api/pets/me/seen');

export const getPetNames = (status) =>
  client.get('/api/pets/names', { params: { status } });

export const reviewPetName = (studentId, status) =>
  client.patch(`/api/pets/names/${studentId}`, { status });

// Modo Libre: the world map and its levels (home practice).
export const getWorldMap = (subject) =>
  studentClient.get(`/api/world/${subject}`);

export const startLevel = (subject, key) =>
  studentClient.post(`/api/world/${subject}/levels/${key}/start`);

export const answerLevel = (attemptId, index, answer, timeMs) =>
  studentClient.post(`/api/world/attempts/${attemptId}/answer`, { index, answer, timeMs });

export const askCompanion = (attemptId, index) =>
  studentClient.post(`/api/world/attempts/${attemptId}/clue`, { index });

// Copihues: recognition currency. Students see theirs; staff give them with a reason.
export const getCopihuesMe = () =>
  studentClient.get('/api/copihues/me');

export const markCopihuesSeen = () =>
  studentClient.post('/api/copihues/me/seen');

export const giveCopihues = (studentIds, amount, reason) =>
  client.post('/api/copihues/awards', { studentIds, amount, reason });

export const getCopihueAwards = (courseName) =>
  client.get('/api/copihues/awards', { params: { course_name: courseName } });

export const undoCopihueAward = (id) =>
  client.delete(`/api/copihues/awards/${id}`);
