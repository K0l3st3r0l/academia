const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

const requireTeacher = (req, res, next) => {
  if (!req.user?.roles?.some(r => ['teacher', 'admin', 'docente', 'director'].includes(r))) {
    return res.status(403).json({ error: 'Solo docentes pueden realizar esta acción' });
  }
  next();
};

module.exports = { authenticateToken, requireTeacher };
