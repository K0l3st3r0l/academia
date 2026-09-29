// Anahuac sends both surnames in one field ("Paterno Materno"). Leading particles
// keep compound paternal surnames whole: "De la Fuente", "San Martín".
const SURNAME_PARTICLES = new Set([
  'de', 'del', 'la', 'las', 'los', 'san', 'santa', 'van', 'von', 'mac', 'mc', 'di', 'da', 'dos', 'das',
]);

const words = (text) => (text || '').trim().split(/\s+/).filter(Boolean);

function paternalSurname(lastName) {
  const taken = [];
  for (const word of words(lastName)) {
    taken.push(word);
    if (!SURNAME_PARTICLES.has(word.toLowerCase())) break;
  }
  return taken.join(' ');
}

// "Mauricio Hernan" + "Rehbein Soto" → "Mauricio Rehbein"
export function shortName(person) {
  if (!person) return '';
  const first = words(person.first_name)[0] || '';
  return [first, paternalSurname(person.last_name)].filter(Boolean).join(' ') || person.email || '';
}
