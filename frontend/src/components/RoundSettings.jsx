import { SUBJECTS } from '../utils/subjects';

// Same values the server accepts in game:start.
const QUESTION_COUNTS = [5, 10, 15];

function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-2 px-3 rounded-xl text-sm font-semibold transition-colors ${
        active
          ? 'bg-brand text-white'
          : 'bg-surface text-gray-400 hover:text-white border border-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

export default function RoundSettings({ subject, onSubjectChange, questionCount, onQuestionCountChange }) {
  return (
    <div className="bg-card rounded-2xl p-6 space-y-4">
      <div>
        <p className="block text-sm font-semibold text-gray-300 mb-2">Asignatura</p>
        <div className="grid grid-cols-3 gap-2">
          {SUBJECTS.map(s => (
            <Toggle key={s.value} active={subject === s.value} onClick={() => onSubjectChange(s.value)}>
              {s.label}
            </Toggle>
          ))}
        </div>
      </div>
      <div>
        <p className="block text-sm font-semibold text-gray-300 mb-2">Preguntas</p>
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
