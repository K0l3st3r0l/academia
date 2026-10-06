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

async function callAnahuac(method, endpoint, config, context) {
  const start = Date.now();
  try {
    const res = await anahuac.request({ method, url: endpoint, ...config });
    logger.info({ endpoint, method, latencyMs: Date.now() - start, status: res.status }, 'Anahuac call');
    return res;
  } catch (err) {
    const status = err.response?.status ?? err.statusCode ?? null;
    logger.warn({ endpoint, method, latencyMs: Date.now() - start, status }, 'Anahuac call failed');
    handleAnahuacError(err, context);
  }
}

async function loginToAnahuac(email, password) {
  const res = await callAnahuac('post', '/api/users/login', { data: { email, password } }, 'loginToAnahuac');
  return res.data;
}

async function getAnahuacProfile(anahuacToken) {
  const res = await callAnahuac('get', '/api/users/me', {
    headers: { Authorization: `Bearer ${anahuacToken}` },
  }, 'getAnahuacProfile');
  return res.data;
}

async function getSchoolCourses(anahuacToken) {
  const res = await callAnahuac('get', '/api/courses/school-courses', {
    headers: { Authorization: `Bearer ${anahuacToken}` },
  }, 'getSchoolCourses');
  return res.data;
}

// Anahuac has no per-course filter: this is every active student in the school.
async function getActiveStudents(anahuacToken) {
  const res = await callAnahuac('get', '/api/students?activo=true', {
    headers: { Authorization: `Bearer ${anahuacToken}` },
  }, 'getActiveStudents');
  return res.data;
}

// ProsodIA reading speed measurements, the ones tied to a student.
// Needs the UTP «velocidad lectora» permission in Anahuac: other staff get a 403.
async function getReadingSpeedByStudent(anahuacToken, fromYear) {
  const res = await callAnahuac('get', '/api/utp/velocidad-lectora/por-alumno', {
    headers: { Authorization: `Bearer ${anahuacToken}` },
    params: { desde_anio: fromYear },
  }, 'getReadingSpeedByStudent');
  return res.data;
}

module.exports = { loginToAnahuac, getAnahuacProfile, getSchoolCourses, getActiveStudents, getReadingSpeedByStudent };
