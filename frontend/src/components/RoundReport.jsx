function pct(correct, answered) {
  return answered ? Math.round((correct / answered) * 100) : null;
}

function toneFor(value) {
  if (value == null) return 'text-gray-500';
  if (value < 50) return 'text-wrong';
  if (value < 75) return 'text-gold';
  return 'text-correct';
}

function barFor(value) {
  if (value < 50) return 'bg-wrong';
  if (value < 75) return 'bg-gold';
  return 'bg-correct';
}

// What the class got wrong in the round, for the teacher only. Counts, never names.
export default function RoundReport({ report }) {
  if (!report?.questions?.length) return null;
  const questions = [...report.questions]
    .filter(q => q.answered > 0)
    .sort((a, b) => pct(a.correct, a.answered) - pct(b.correct, b.answered));

  return (
    <div className="bg-card rounded-2xl p-5 space-y-5">
      {report.oas.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">Resultado por OA</h3>
          <ul className="space-y-3">
            {report.oas.map(oa => {
              const value = pct(oa.correct, oa.answered);
              return (
                <li key={oa.oaCode}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="text-gray-500 mr-1">{oa.oaCode}</span>
                      <span className="text-gray-200">{oa.oaLabel || 'Sin etiqueta'}</span>
                    </span>
                    <span className={`font-bold tabular-nums ${toneFor(value)}`}>{value ?? '—'}%</span>
                  </div>
                  <div className="h-2 bg-surface rounded-full mt-1 overflow-hidden">
                    <div className={`h-full rounded-full ${barFor(value ?? 0)}`} style={{ width: `${value ?? 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-bold mb-1">Pregunta por pregunta</h3>
        <p className="text-gray-400 text-sm mb-3">De la que más costó a la que menos.</p>
        <ol className="space-y-3">
          {questions.map(q => {
            const value = pct(q.correct, q.answered);
            return (
              <li key={q.index} className="bg-surface rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-200">{q.text}</p>
                  <span className={`font-black tabular-nums ${toneFor(value)}`}>{value}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {q.correct} de {q.answered} acertaron · Correcta: <span className="text-correct">{q.correctAnswer}</span>
                </p>
                {q.topWrong && q.topWrong.count > 1 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {q.topWrong.count} de {q.answered} eligieron <span className="text-wrong">«{q.topWrong.answer}»</span>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
