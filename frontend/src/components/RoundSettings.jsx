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

// Teachers reach objectives through the curriculum's ejes (Números y operaciones, Lectura,
// Geografía…): an eje selects its OA with questions, and each OA can then be unchecked. Units of
// the Programa de Estudio stay as a shortcut.
function OaPicker({ curriculum, selected, onChange }) {
  const oas = quizOas(curriculum);
  const ejes = [...new Set(oas.map(o => o.eje))];
  const selectedSet = new Set(selected);
  const playable = list => list.filter(o => o.active_questions > 0).map(o => o.code);
  // An eje stays open while the teacher works on it, even with all its OA unchecked.
  const [openEjes, setOpenEjes] = useState(() => ejes.filter(e => oas.some(o => o.eje === e && selectedSet.has(o.code))));
  const [showUnits, setShowUnits] = useState(false);

  const toggleEje = eje => {
    const codes = playable(oas.filter(o => o.eje === eje));
    const next = new Set(selected);
    if (openEjes.includes(eje)) {
      setOpenEjes(openEjes.filter(e => e !== eje));
      codes.forEach(c => next.delete(c));
    } else {
      setOpenEjes([...openEjes, eje]);
      codes.forEach(c => next.add(c));
    }
    onChange([...next]);
  };
  const toggleOa = code => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next]);
  };
  const clearAll = () => {
    setOpenEjes([]);
    onChange([]);
  };

  const unitOas = unit => playable(oas.filter(o => o.units.includes(unit)));
  const unitActive = unit => {
    const codes = unitOas(unit);
    return codes.length > 0 && codes.every(c => selectedSet.has(c));
  };
  const toggleUnit = unit => {
    const codes = unitOas(unit);
    const next = new Set(selected);
    if (unitActive(unit)) codes.forEach(c => next.delete(c));
    else codes.forEach(c => next.add(c));
    setOpenEjes(ejes.filter(e => openEjes.includes(e) || oas.some(o => o.eje === e && next.has(o.code))));
    onChange([...next]);
  };
  const unitLabel = u => (u.title ? `Unidad ${u.number}: ${u.title}` : `Unidad ${u.number}`);

  const available = oas.filter(o => selectedSet.has(o.code)).reduce((sum, o) => sum + o.active_questions, 0);
  const shownEjes = ejes.filter(e => openEjes.includes(e));

  return (
    <div>
      <p className="text-sm font-semibold text-gray-300 mb-2">Eje</p>
      <div className="flex flex-wrap gap-2">
        <Toggle active={selected.length === 0 && openEjes.length === 0} onClick={clearAll}>Toda la asignatura</Toggle>
        {ejes.map(eje => (
          <Toggle key={eje} active={openEjes.includes(eje)} disabled={playable(oas.filter(o => o.eje === eje)).length === 0}
            onClick={() => toggleEje(eje)}>
            {eje}
          </Toggle>
        ))}
      </div>

      {shownEjes.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-300 mb-2">Objetivos</p>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {shownEjes.map(eje => (
              <div key={eje}>
                {shownEjes.length > 1 && <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">{eje}</p>}
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
        </div>
      )}

      {selected.length === 0 && openEjes.length > 0 && (
        <p className="text-gray-400 text-sm mt-2">Sin objetivos marcados: la ronda usa toda la asignatura.</p>
      )}
      {selected.length > 0 && (
        <p className="text-gray-400 text-sm mt-2">
          {selected.length} objetivo{selected.length === 1 ? '' : 's'} · {available} pregunta{available === 1 ? '' : 's'} disponible{available === 1 ? '' : 's'}
        </p>
      )}

      {(curriculum.units ?? []).length > 0 && (
        <>
          <button type="button" onClick={() => setShowUnits(v => !v)} aria-expanded={showUnits}
            className="mt-3 text-sm text-brand-light underline">
            {showUnits ? 'Ocultar las unidades' : 'Elegir por unidad del programa'}
          </button>
          {showUnits && (
            <div className="flex flex-wrap gap-2 mt-2">
              {curriculum.units.map(u => (
                <Toggle key={u.number} active={unitActive(u.number)} disabled={unitOas(u.number).length === 0} onClick={() => toggleUnit(u.number)}>
                  {unitLabel(u)}
                </Toggle>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RoundSettings({
  subject, onSubjectChange,
  questionCount, onQuestionCountChange,
  curriculum, selectedOAs = [], onSelectedOAsChange,
  level, onLevelChange,
  className = 'bg-card rounded-2xl p-6 space-y-5',
}) {
  const levelHint = LEVELS.find(l => l.value === level)?.hint;
  return (
    <div className={className}>
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
        <OaPicker key={quizOas(curriculum).map(o => o.code).join('|')} curriculum={curriculum} selected={selectedOAs} onChange={onSelectedOAsChange} />
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
