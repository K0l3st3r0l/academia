export const SUBJECTS = [
  { value: 'matematica', label: 'Matemática' },
  { value: 'lenguaje', label: 'Lenguaje' },
  { value: 'ciencias', label: 'Ciencias' },
  { value: 'historia', label: 'Historia' },
  { value: 'ingles', label: 'Inglés' },
  { value: 'general', label: 'General' },
];

export const SUBJECT_LABELS = Object.fromEntries(SUBJECTS.map(s => [s.value, s.label]));

export function subjectLabel(value) {
  return SUBJECT_LABELS[value] || value;
}
