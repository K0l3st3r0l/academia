const express = require('express');
const logger = require('../logger');
const { authenticateToken, requireTeacher } = require('../middleware/auth');
const { getCurriculum } = require('../services/curriculum');
const { VALID_SUBJECTS, VALID_GRADES } = require('./questionRoutes');

const router = express.Router();

// OA of a subject and grade, grouped by the client by eje, with how many active
// questions each one has so the teacher doesn't pick an empty OA.
router.get('/:gradeLevel/:subject', authenticateToken, requireTeacher, async (req, res) => {
  const { gradeLevel, subject } = req.params;
  if (!VALID_SUBJECTS.includes(subject) || !VALID_GRADES.includes(gradeLevel)) {
    return res.status(400).json({ error: 'Curso o asignatura inválidos' });
  }
  try {
    res.json({ oas: await getCurriculum({ subject, gradeLevel }) });
  } catch (err) {
    logger.error({ err }, 'curriculum fetch error');
    res.status(500).json({ error: 'Error al obtener el currículum' });
  }
});

module.exports = router;
