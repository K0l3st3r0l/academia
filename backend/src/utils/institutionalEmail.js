// Workspace convention confirmed by the school: nombre.paterno.materno@escuelaanahuac.cl,
// lowercase, accents dropped (only the vowel remains) and ñ written as n.
const INSTITUTIONAL_DOMAIN = 'escuelaanahuac.cl';

function emailPart(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function institutionalEmail({ nombre1, apellido_paterno, apellido_materno }) {
  const first = emailPart(nombre1);
  const paternal = emailPart(apellido_paterno);
  if (!first || !paternal) return null;
  const local = [first, paternal, emailPart(apellido_materno)].filter(Boolean).join('.');
  return `${local}@${INSTITUTIONAL_DOMAIN}`;
}

module.exports = { institutionalEmail, INSTITUTIONAL_DOMAIN };
