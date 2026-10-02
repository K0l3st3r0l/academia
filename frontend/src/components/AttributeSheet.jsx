// The character's attributes are the student's measured skill per subject. A value
// stays hidden until there are enough answers to mean something.
const SUBJECT_HINT = {
  fuerza: 'Matemática',
  energia: 'Lenguaje',
  percepcion: 'Ciencias',
  resistencia: 'Historia',
  agilidad: 'Inglés',
};

export default function AttributeSheet({ attributes }) {
  if (!attributes) return null;
  return (
    <div className="bg-card rounded-2xl p-5 shadow-xl">
      <h3 className="font-bold mb-1">Atributos</h3>
      <p className="text-gray-400 text-sm mb-4">Suben cuando aprendes. Juega para descubrirlos.</p>
      <ul className="space-y-4">
        {attributes.map(a => (
          <li key={a.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-bold text-white">{a.label}</span>
                <span className="text-gray-500 text-xs ml-2">{SUBJECT_HINT[a.key]}</span>
              </span>
              {a.value == null ? (
                <span className="text-gray-500 text-sm">Por descubrir</span>
              ) : (
                <span className="font-black text-gold tabular-nums text-lg">{a.value}</span>
              )}
            </div>
            <div className="h-2.5 bg-surface rounded-full mt-1 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-light" style={{ width: `${a.value ?? 0}%` }} />
            </div>
            {a.ejes.some(e => e.value != null) && (
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {a.ejes.filter(e => e.value != null).map(e => (
                  <li key={e.eje} className="flex justify-between text-xs text-gray-400">
                    <span className="truncate mr-2">{e.eje}</span>
                    <span className="tabular-nums text-gray-300">{e.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
