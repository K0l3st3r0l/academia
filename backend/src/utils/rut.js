// Adaptado de /root/apps/anahuac/shared/utils/rut.js (cleanRut) — misma
// lógica de limpieza, reusada aquí porque academia no comparte paquete con anahuac.
function normalizeRut(rut) {
  if (!rut) return '';
  return String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
}

// Módulo 11. Separa un RUT mal tipeado de uno que no está en el curso, y así el
// error de tipeo no cuenta como intento fallido. Nueve dígitos: el IPE de
// alumnos extranjeros (100.xxx.xxx-x) usa el mismo dígito verificador.
function isValidRut(rut) {
  const clean = normalizeRut(rut);
  if (!/^\d{7,9}[0-9K]$/.test(clean)) return false;

  const body = clean.slice(0, -1);
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  return clean.slice(-1) === expected;
}

module.exports = { normalizeRut, isValidRut };
