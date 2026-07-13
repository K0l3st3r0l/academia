// Adaptado de /root/apps/anahuac/shared/utils/rut.js (cleanRut) — misma
// lógica de limpieza, reusada aquí porque academia no comparte paquete con anahuac.
function normalizeRut(rut) {
  if (!rut) return '';
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

module.exports = { normalizeRut };
