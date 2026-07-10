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

async function getStudentsByCourse(anahuacToken, courseName) {
  const res = await callAnahuac('get', '/api/students?activo=true', {
    headers: { Authorization: `Bearer ${anahuacToken}` },
  }, 'getStudentsByCourse');
  return res.data.filter(s => s.curso === courseName);
}

module.exports = { loginToAnahuac, getAnahuacProfile, getSchoolCourses, getStudentsByCourse };
