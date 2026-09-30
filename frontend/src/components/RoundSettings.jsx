import { useState } from 'react';
import { SUBJECTS } from '../utils/subjects';

// Same values the server accepts in game:start.
const QUESTION_COUNTS = [5, 10, 15];
const LEVELS = [
  { value: 'repaso', label: 'Repaso', hint: 'Preguntas que la mayoría del curso debería acertar.' },
  { value: 'ajustado', label: 'Ajustado al curso', hint: 'Ni muy fáciles ni muy difíciles para lo que el curso sabe hoy.' },
  { value: 'desafio', label: 'Desafío', hint: 'Preguntas que al curso todavía le cuestan.' },
];

function Toggle({ active, onClick, disabled, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`py-2 px-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'bg-brand text-white'
          : 'bg-surface text-gray-400 hover:text-white border border-gray-700'
      } ${className}`}
    >
      {children}
    </button>
  );
}

// Only OA that multiple-choice questions can assess are offered.
function quizOas(curriculum) {
  return (curriculum?.oas ?? []).filter(o => o.quiz);
}

function OaPicker({ curriculum, selected, onChange }) {
  const [showList, setShowList] = useState(false);
  const oas = quizOas(curriculum);
  const selectedSet = new Set(selected);
  const unitOas = unit => oas.filter(o => o.units.includes(unit) && o.active_questions > 0).map(o => o.code);
  const unitActive = unit => {
    const codes = unitOas(unit);
    return codes.length > 0 && codes.every(c => selectedSet.has(c));
  };
  const toggleUnit = unit => {
    const codes = unitOas(unit);
    const next = new Set(selected);
    if (unitActive(unit)) codes.forEach(c => next.delete(c));
    else codes.forEach(c => next.add(c));
    onChange([...next]);
  };
  const toggleOa = code => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next]);
  };
  // Math units read as «Geometría y Medición»; units mixing more ejes keep just the number.
  const unitLabel = u => {
    if (u.title) return `Unidad ${u.number}: ${u.title}`;
    const ejes = [...new Set(oas.filter(o => !o.all_year && o.units.includes(u.number)).map(o => o.eje))];
    return ejes.length && ejes.length <= 2 ? `Unidad ${u.number} · ${ejes.join(' y ')}` : `Unidad ${u.number}`;
  };
  const available = oas.filter(o => selectedSet.has(o.code)).reduce((sum, o) => sum + o.active_questions, 0);
  const ejes = [...new Set(oas.map(o => o.eje))];

  return (
    <div>
      <p className="text-sm font-semibold text-gray-300 mb-2">Qué reforzar</p>
      <div className="flex flex-wrap gap-2">
        <Toggle active={selected.length === 0} onClick={() => onChange([])}>Toda la asignatura</Toggle>
        {(curriculum.units ?? []).map(u => (
          <Toggle key={u.number} active={unitActive(u.number)} disabled={unitOas(u.number).length === 0} onClick={() => toggleUnit(u.number)}>
            {unitLabel(u)}
          </Toggle>
        ))}
      </div>

      {selected.length > 0 && (
        <p className="text-gray-400 text-sm mt-2">
          {selected.length} OA elegido{selected.length === 1 ? '' : 's'} · {available} pregunta{available === 1 ? '' : 's'} disponible{available === 1 ? '' : 's'}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowList(v => !v)}
        aria-expanded={showList}
        className="mt-3 text-sm text-brand-light underline"
      >
        {showList ? 'Ocultar los OA' : 'Elegir OA uno por uno'}
      </button>

      {showList && (
        <div className="mt-3 space-y-4 max-h-80 overflow-y-auto pr-1">
          {ejes.map(eje => (
            <div key={eje}>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">{eje}</p>
              <ul className="space-y-1">
                {oas.filter(o => o.eje === eje).map(o => (
                  <li key={o.code}>
                    <label className={`flex items-start gap-2 text-sm rounded-lg px-2 py-1.5 ${o.active_questions ? 'cursor-pointer hover:bg-surface' : 'opacity-40'}`}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(o.code)}
                        disabled={!o.active_questions}
                        onChange={() => toggleOa(o.code)}
                        className="mt-0.5 accent-brand"
                      />
                      <span className="flex-1">
                        <span className="text-gray-500 mr-1">{o.code}</span>
                        <span className="text-gray-200" title={o.text}>{o.label}</span>
                      </span>
                      <span className="text-gray-500 text-xs whitespace-nowrap">
                        {o.active_questions ? `${o.active_questions} preg.` : 'sin preguntas'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoundSettings({
  subject, onSubjectChange,
  questionCount, onQuestionCountChange,
  curriculum, selectedOAs = [], onSelectedOAsChange,
  level, onLevelChange,
}) {
  const levelHint = LEVELS.find(l => l.value === level)?.hint;
  return (
    <div className="bg-card rounded-2xl p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-300 mb-2">Asignatura</p>
        <div className="grid grid-cols-3 gap-2">
          {SUBJECTS.map(s => (
            <Toggle key={s.value} active={subject === s.value} onClick={() => onSubjectChange(s.value)}>
              {s.label}
            </Toggle>
          ))}
        </div>
      </div>

      {quizOas(curriculum).length > 0 && onSelectedOAsChange && (
        <OaPicker curriculum={curriculum} selected={selectedOAs} onChange={onSelectedOAsChange} />
      )}

      {onLevelChange && (
        <div>
          <p className="text-sm font-semibold text-gray-300 mb-2">Exigencia</p>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map(l => (
              <Toggle key={l.value} active={level === l.value} onClick={() => onLevelChange(l.value)}>
                {l.label}
              </Toggle>
            ))}
          </div>
          {levelHint && <p className="text-gray-400 text-sm mt-2">{levelHint}</p>}
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-gray-300 mb-2">Preguntas</p>
        <div className="grid grid-cols-3 gap-2">
          {QUESTION_COUNTS.map(n => (
            <Toggle key={n} active={questionCount === n} onClick={() => onQuestionCountChange(n)}>
              {n}
            </Toggle>
          ))}
        </div>
      </div>
    </div>
  );
}
