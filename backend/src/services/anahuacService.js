const axios = require('axios');
const logger = require('../logger');

const BASE_URL = process.env.ANAHUAC_API_URL;
const TIMEOUT_MS = 8000;

const anahuac = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT_MS });

function handleAnahuacError(err, context) {
  if (err.code === 'ECONNABORTED') {
    logger.warn({ context }, 'Anahuac timeout');
    throw Object.assign(new Error('Anahuac no respondió a tiempo'), { statusCode: 504 });
  }
  if (!err.response) {
    logger.warn({ context, message: err.message }, 'Anahuac unreachable');
    throw Object.assign(new Error('No se pudo conectar con Anahuac'), { statusCode: 503 });
  }
  throw err;
}

async function loginToAnahuac(email, password) {
  try {
    const res = await anahuac.post('/api/users/login', { email, password });
    return res.data;
  } catch (err) {
    handleAnahuacError(err, 'loginToAnahuac');
  }
}

async function getAnahuacProfile(anahuacToken) {
  try {
    const res = await anahuac.get('/api/users/me', {
      headers: { Authorization: `Bearer ${anahuacToken}` },
    });
    return res.data;
  } catch (err) {
    handleAnahuacError(err, 'getAnahuacProfile');
  }
}

async function getSchoolCourses(anahuacToken) {
  try {
    const res = await anahuac.get('/api/courses/school-courses', {
      headers: { Authorization: `Bearer ${anahuacToken}` },
    });
    return res.data;
  } catch (err) {
    handleAnahuacError(err, 'getSchoolCourses');
  }
}

async function getStudentsByCourse(anahuacToken, courseName) {
  try {
    const res = await anahuac.get('/api/students?activo=true', {
      headers: { Authorization: `Bearer ${anahuacToken}` },
    });
    return res.data.filter(s => s.curso === courseName);
  } catch (err) {
    handleAnahuacError(err, 'getStudentsByCourse');
  }
}

module.exports = { loginToAnahuac, getAnahuacProfile, getSchoolCourses, getStudentsByCourse };
