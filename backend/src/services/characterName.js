// Students pick their character's name freely; an admin reviews every one. This only
// stops what should never reach the review queue: contact data and obvious slurs.
const MIN = 3;
const MAX = 20;

// Matched inside the name with spaces and symbols removed: long enough not to hide
// in ordinary words.
const BLOCKED_ANYWHERE = [
  'conchetumare', 'conchatumadre', 'conchesumadre', 'culiao', 'culiado', 'huevon', 'hueon', 'weon',
  'aweonao', 'mierda', 'maricon', 'maraco', 'pichula', 'porno', 'zorra', 'imbecil', 'estupido',
  'idiota', 'hitler', 'verga', 'chucha', 'chupalo',
];
// Short ones only as whole words: «puta» is inside «computadora».
const BLOCKED_WORDS = ['wn', 'ctm', 'csm', 'pico', 'raja', 'puta', 'puto', 'nazi', 'gil', 'tula', 'perra', 'pene', 'poto', 'sexo'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

function cleanName(raw) {
  return String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function foldForMatching(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$]/g, ch => LEET[ch])
    .replace(/(.)\1+/g, '$1');
}

// Returns an error message for the student, or null when the name can go to review.
function nameProblem(raw) {
  const name = cleanName(raw);
  if (name.length < MIN || name.length > MAX) return `El nombre debe tener entre ${MIN} y ${MAX} caracteres.`;
  if (!/^[\p{L}\d' -]+$/u.test(name)) return 'Usa solo letras, números, espacios o guiones.';
  if ((name.match(/\d/g) || []).length > 4) return 'El nombre no puede tener más de 4 números.';
  if (!/\p{L}/u.test(name)) return 'El nombre necesita al menos una letra.';

  const folded = foldForMatching(name);
  const compact = folded.replace(/[^a-zñ]/g, '');
  const words = folded.split(/[^a-zñ]+/).filter(Boolean);
  if (BLOCKED_ANYWHERE.some(w => compact.includes(w)) || words.some(w => BLOCKED_WORDS.includes(w))) {
    return 'Ese nombre no está permitido. Prueba con otro.';
  }
  return null;
}

module.exports = { cleanName, nameProblem };
