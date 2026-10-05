import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCurriculum, getQuestions, getQuestionSummary, createQuestion, updateQuestion, reviewQuestion,
  toggleQuestion, deleteQuestion,
} from '../api/client';
import { SUBJECTS, subjectLabel } from '../utils/subjects';

const GRADES = ['3b', '4b', '5b', '6b', 'general'];
const GRADE_LABELS = { '3b': '3° básico', '4b': '4° básico', '5b': '5° básico', '6b': '6° básico', general: 'General' };
// The plan's goal per OA: enough questions to adapt to each student without repeating.
const TARGET_PER_OA = 12;

const TABS = [
  { id: 'draft', label: 'Por revisar' },
  { id: 'approved', label: 'En uso' },
  { id: 'rejected', label: 'Descartadas' },
];

const DIFFICULTY = {
  easy: { label: 'Fácil', className: 'text-correct' },
  medium: { label: 'Media', className: 'text-gold' },
  hard: { label: 'Difícil', className: 'text-wrong' },
};

const REJECT_REASONS = ['Respuesta incorrecta', 'Más de una correcta', 'Ambigua', 'No es de este OA', 'No es del nivel', 'Redacción'];

const EMPTY_FORM = {
  subject: 'matematica', grade_level: '5b', difficulty: 'medium', text: '',
  options: ['', '', '', ''], correct: '', hint: '', clue: '', oa_code: '',
};

const FIELD = 'w-full bg-surface border border-gray-700 focus:border-brand rounded-xl px-3 py-2 text-white text-sm outline-none';
const SMALL_BUTTON = 'text-xs font-semibold px-3 py-2 rounded-lg border transition-colors';

function sourceLabel(source) {
  if (!source) return null;
  if (source.startsWith('ia:')) return 'Escrita con IA';
  return { manual: 'Escrita por un profesor', import: 'Banco inicial' }[source] ?? source;
}

function CoveragePanel({ oas, selected, onSelect }) {
  // On a phone the full list pushes the questions far down: it starts folded there.
  const [open] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  if (!oas.length) return null;
  const ejes = [...new Set(oas.map(o => o.eje))];
  const covered = oas.filter(o => o.active_questions >= TARGET_PER_OA).length;
  return (
    <details open={open} className="bg-card rounded-2xl p-4 mb-5 group">
      <summary className="flex items-baseline justify-between gap-3 cursor-pointer list-none">
        <span className="text-sm font-bold text-gray-200">
          Preguntas por objetivo <span className="font-normal text-gray-400">· {covered} de {oas.length} OA con {TARGET_PER_OA} o más</span>
        </span>
        <span className="text-xs text-gray-500 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
      </summary>
      {selected && (
        <button type="button" onClick={() => onSelect('')} className="text-xs text-brand-light hover:text-white mt-2">
          Ver todos los OA
        </button>
      )}
      <div className="space-y-3 mt-3">
        {ejes.map(eje => (
          <div key={eje}>
            <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">{eje}</p>
            <div className="grid sm:grid-cols-2 gap-1">
              {oas.filter(o => o.eje === eje).map(o => {
                const share = Math.min(1, o.active_questions / TARGET_PER_OA);
                return (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => onSelect(selected === o.code ? '' : o.code)}
                    aria-pressed={selected === o.code}
                    title={o.text}
                    className={`text-left rounded-lg px-2 py-1.5 border transition-colors ${
                      selected === o.code ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-surface'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-gray-200 truncate"><span className="text-gray-500">{o.code}</span> {o.label}</span>
                      <span className="text-gray-400 tabular-nums shrink-0">
                        {o.active_questions}/{TARGET_PER_OA}
                        {o.draft_questions > 0 && <span className="text-gold"> · {o.draft_questions} por revisar</span>}
                      </span>
                    </span>
                    <span className="block h-1 mt-1 bg-surface rounded-full overflow-hidden">
                      <span className={`block h-full rounded-full ${share >= 1 ? 'bg-correct' : 'bg-brand-light'}`} style={{ width: `${share * 100}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function RejectForm({ onCancel, onConfirm, busy }) {
  const [note, setNote] = useState('');
  return (
    <div className="mt-3 bg-surface rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-300">¿Por qué se descarta?</p>
      <div className="flex flex-wrap gap-1.5">
        {REJECT_REASONS.map(r => (
          <button key={r} type="button" onClick={() => setNote(r)}
            className={`text-xs px-2.5 py-1 rounded-full border ${note === r ? 'border-wrong text-wrong' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}>
            {r}
          </button>
        ))}
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="O escribe el motivo"
        aria-label="Motivo del descarte" className={FIELD} />
      <div className="flex gap-2">
        <button type="button" disabled={!note.trim() || busy} onClick={() => onConfirm(note)}
          className={`${SMALL_BUTTON} border-wrong/50 text-wrong hover:bg-wrong/10 disabled:opacity-40`}>
          Descartar
        </button>
        <button type="button" onClick={onCancel} className={`${SMALL_BUTTON} border-gray-700 text-gray-400 hover:text-gray-200`}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function QuestionCard({ q, onApprove, onEdit, onReject, onRestore, onToggle, onDelete }) {
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };
  const diff = DIFFICULTY[q.difficulty];
  const notes = q.option_notes || {};
  const isDraft = q.status === 'draft';

  return (
    <article className={`bg-card rounded-2xl p-4 border ${q.status === 'approved' && !q.active ? 'border-gray-800 opacity-60' : 'border-gray-800'}`}>
      <header className="flex items-center gap-2 mb-2 flex-wrap text-xs">
        {q.oa_code && <span className="font-bold text-brand-light bg-brand/20 px-2 py-0.5 rounded-full">{q.oa_code}</span>}
        {diff && <span className={`font-semibold ${diff.className}`}>{diff.label}</span>}
        {sourceLabel(q.source) && <span className="text-gray-600">· {sourceLabel(q.source)}</span>}
        {q.status === 'approved' && !q.active && <span className="text-gray-500">· Desactivada</span>}
      </header>

      <p className="font-semibold leading-snug whitespace-pre-line">{q.text}</p>

      <ul className="mt-3 space-y-1.5">
        {q.options.map(opt => {
          const correct = opt === q.correct;
          return (
            <li key={opt} className={`rounded-lg px-3 py-1.5 text-sm ${correct ? 'bg-correct/15 text-correct font-semibold' : 'bg-surface text-gray-300'}`}>
              <span>{correct ? '✓ ' : ''}{opt}</span>
              {!correct && notes[opt] && <span className="block text-xs text-gray-500 mt-0.5">Error que revela: {notes[opt]}</span>}
            </li>
          );
        })}
      </ul>

      {(q.hint || q.clue) && (
        <dl className="mt-3 grid gap-1 text-xs">
          {q.clue && <div><dt className="inline text-gray-500">Pista antes de responder: </dt><dd className="inline text-gray-300">{q.clue}</dd></div>}
          {q.hint && <div><dt className="inline text-gray-500">Al revelar la respuesta: </dt><dd className="inline text-gray-300">{q.hint}</dd></div>}
        </dl>
      )}

      {q.check_note && isDraft && (
        <p className="mt-3 text-xs bg-gold/10 border border-gold/30 text-gold rounded-lg px-3 py-2">
          Revisión automática: {q.check_note}
        </p>
      )}
      {q.status === 'rejected' && q.review_note && (
        <p className="mt-3 text-xs bg-wrong/10 border border-wrong/30 text-wrong rounded-lg px-3 py-2">
          Descartada{q.reviewer_name ? ` por ${q.reviewer_name}` : ''}: {q.review_note}
        </p>
      )}

      {rejecting ? (
        <RejectForm busy={busy} onCancel={() => setRejecting(false)} onConfirm={note => run(() => onReject(q, note))} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {isDraft && (
            <button type="button" disabled={busy} onClick={() => run(() => onApprove(q))}
              className={`${SMALL_BUTTON} bg-correct/15 border-correct/40 text-correct hover:bg-correct/25 disabled:opacity-40`}>
              Aprobar
            </button>
          )}
          {q.status !== 'rejected' && (
            <button type="button" onClick={() => onEdit(q)} className={`${SMALL_BUTTON} border-gray-700 text-gray-300 hover:border-gray-500`}>
              {isDraft ? 'Corregir' : 'Editar'}
            </button>
          )}
          {q.status === 'approved' && (
            <button type="button" disabled={busy} onClick={() => run(() => onToggle(q))}
              className={`${SMALL_BUTTON} border-gray-700 text-gray-300 hover:border-gray-500`}>
              {q.active ? 'Desactivar' : 'Activar'}
            </button>
          )}
          {q.status !== 'rejected' && (
            <button type="button" onClick={() => setRejecting(true)} className={`${SMALL_BUTTON} border-gray-700 text-wrong/80 hover:border-wrong/50`}>
              Descartar
            </button>
          )}
          {q.status === 'rejected' && (
            <button type="button" disabled={busy} onClick={() => run(() => onRestore(q))}
              className={`${SMALL_BUTTON} border-gray-700 text-gray-300 hover:border-gray-500`}>
              Volver a revisar
            </button>
          )}
          {q.status === 'approved' && q.source === 'manual' && (
            <button type="button" disabled={busy} onClick={() => run(() => onDelete(q))}
              className={`${SMALL_BUTTON} border-gray-800 text-gray-600 hover:text-wrong ml-auto`}>
              Eliminar
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function QuestionForm({ initial, editingDraft, oas, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const setOption = (i, value) => setForm(f => {
    const options = [...f.options];
    const wasCorrect = f.correct && f.correct === options[i];
    options[i] = value;
    return { ...f, options, correct: wasCorrect ? value : f.correct };
  });

  const submit = async (approve) => {
    if (!form.correct) return setError('Marca la alternativa correcta');
    setSaving(true);
    setError('');
    try {
      await onSave(form, approve);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="question-form-title">
      <div className="bg-card rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
        <h2 id="question-form-title" className="text-xl font-black mb-5">
          {initial.id ? (editingDraft ? 'Corregir borrador' : 'Editar pregunta') : 'Nueva pregunta'}
        </h2>
        <form onSubmit={e => { e.preventDefault(); submit(false); }} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block text-xs font-semibold text-gray-400">
              Asignatura
              <select value={form.subject} onChange={e => set('subject', e.target.value)} className={`${FIELD} mt-1`}>
                {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-400">
              Curso
              <select value={form.grade_level} onChange={e => set('grade_level', e.target.value)} className={`${FIELD} mt-1`}>
                {GRADES.map(g => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-400">
              Dificultad
              <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)} className={`${FIELD} mt-1`}>
                {Object.entries(DIFFICULTY).map(([value, d]) => <option key={value} value={value}>{d.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-xs font-semibold text-gray-400">
            Objetivo de aprendizaje
            {oas.length ? (
              <select value={form.oa_code} onChange={e => set('oa_code', e.target.value)} className={`${FIELD} mt-1`}>
                <option value="">Sin OA</option>
                {oas.map(o => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
              </select>
            ) : (
              <input value={form.oa_code} onChange={e => set('oa_code', e.target.value)} placeholder="ej: OA3" className={`${FIELD} mt-1`} />
            )}
          </label>

          <label className="block text-xs font-semibold text-gray-400">
            Pregunta
            <textarea value={form.text} onChange={e => set('text', e.target.value)} required rows={3} className={`${FIELD} mt-1 resize-y`} />
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-400 mb-2">Alternativas <span className="text-gray-600 font-normal">(marca la correcta)</span></legend>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correct" aria-label={`Alternativa ${i + 1} es la correcta`}
                    checked={form.correct === opt && opt !== ''} onChange={() => opt && set('correct', opt)}
                    className="accent-green-500 w-4 h-4 shrink-0" />
                  <input value={opt} onChange={e => setOption(i, e.target.value)} placeholder={`Alternativa ${i + 1}`} required
                    aria-label={`Alternativa ${i + 1}`} className={FIELD} />
                </div>
              ))}
            </div>
          </fieldset>

          <label className="block text-xs font-semibold text-gray-400">
            Al revelar la respuesta <span className="text-gray-600 font-normal">(por qué es la correcta; se lee en 5 segundos)</span>
            <textarea value={form.hint} onChange={e => set('hint', e.target.value)} maxLength={160} rows={2} className={`${FIELD} mt-1 resize-y`} />
          </label>
          <label className="block text-xs font-semibold text-gray-400">
            Pista antes de responder <span className="text-gray-600 font-normal">(opcional; orienta sin dar la respuesta)</span>
            <input value={form.clue} onChange={e => set('clue', e.target.value)} maxLength={140} className={`${FIELD} mt-1`} />
          </label>

          {error && <p role="alert" className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 font-bold py-3 rounded-xl transition-colors disabled:opacity-50 ${editingDraft ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-brand hover:bg-brand-dark text-white'}`}>
              {saving ? 'Guardando…' : editingDraft ? 'Guardar sin aprobar' : 'Guardar'}
            </button>
            {editingDraft && (
              <button type="button" disabled={saving} onClick={() => submit(true)}
                className="flex-1 bg-correct/80 hover:bg-correct text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50">
                Guardar y aprobar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function QuestionBank() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('draft');
  const [subject, setSubject] = useState('matematica');
  const [grade, setGrade] = useState('5b');
  const [oa, setOa] = useState('');
  const [questions, setQuestions] = useState([]);
  const [curriculum, setCurriculum] = useState(null);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const quizOas = useMemo(() => (curriculum?.oas ?? []).filter(o => o.quiz), [curriculum]);
  const oaLabels = useMemo(() => Object.fromEntries((curriculum?.oas ?? []).map(o => [o.code, o.label])), [curriculum]);
  const counts = useMemo(() => {
    const c = { draft: 0, approved: 0, rejected: 0 };
    summary.filter(r => r.subject === subject && r.grade_level === grade).forEach(r => { c[r.status] = r.count; });
    return c;
  }, [summary, subject, grade]);
  const draftsElsewhere = useMemo(
    () => summary.filter(r => r.status === 'draft' && !(r.subject === subject && r.grade_level === grade)),
    [summary, subject, grade]
  );

  const refreshCounts = useCallback(() => {
    getQuestionSummary().then(r => setSummary(r.data)).catch(() => {});
    if (grade !== 'general' && subject !== 'general') {
      getCurriculum(grade, subject).then(r => setCurriculum(r.data)).catch(() => setCurriculum(null));
    } else {
      setCurriculum(null);
    }
  }, [grade, subject]);

  useEffect(() => { refreshCounts(); setOa(''); }, [refreshCounts]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    getQuestions({ status: tab, subject, grade_level: grade, ...(oa ? { oa_code: oa } : {}) })
      .then(r => { if (current) setQuestions(r.data); })
      .catch(() => { if (current) setError('No se pudieron cargar las preguntas.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [tab, subject, grade, oa, reloadKey]);

  // A reviewed question leaves the current tab right away; counts catch up in the background.
  const settle = (id, replacement) => {
    setQuestions(qs => (replacement ? qs.map(q => (q.id === id ? replacement : q)) : qs.filter(q => q.id !== id)));
    refreshCounts();
  };
  const act = async (fn) => {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la acción.');
    }
  };

  const handlers = {
    onApprove: q => act(async () => { await reviewQuestion(q.id, 'approve'); settle(q.id); }),
    onReject: (q, note) => act(async () => { await reviewQuestion(q.id, 'reject', note); settle(q.id); }),
    onRestore: q => act(async () => { await reviewQuestion(q.id, 'draft'); settle(q.id); }),
    onToggle: q => act(async () => { const r = await toggleQuestion(q.id); settle(q.id, r.data); }),
    onDelete: q => act(async () => {
      if (!window.confirm('¿Eliminar esta pregunta? No se puede deshacer.')) return;
      await deleteQuestion(q.id);
      settle(q.id);
    }),
    onEdit: q => setEditing({ ...EMPTY_FORM, ...q, hint: q.hint || '', clue: q.clue || '', oa_code: q.oa_code || '' }),
  };

  const save = async (form, approve) => {
    const body = { ...form, approve };
    if (form.id) {
      const r = await updateQuestion(form.id, body);
      const stays = r.data.status === tab && r.data.subject === subject && r.data.grade_level === grade;
      settle(form.id, stays ? { ...r.data, reviewer_name: form.reviewer_name } : null);
    } else {
      await createQuestion(body);
      setReloadKey(k => k + 1);
      refreshCounts();
    }
    setEditing(null);
  };

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <button onClick={() => navigate('/teacher')} className="text-gray-500 hover:text-gray-300 text-sm mb-1">← Volver</button>
          <h1 className="text-2xl font-black text-brand-light">Banco de preguntas</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            Las preguntas escritas con IA entran al juego solo cuando un profesor o UTP las aprueba.
          </p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY_FORM, subject, grade_level: grade, oa_code: oa })}
          className="bg-brand hover:bg-brand-dark text-white font-bold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          + Nueva
        </button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <label className="text-xs text-gray-400">
          <span className="sr-only">Asignatura</span>
          <select value={subject} onChange={e => setSubject(e.target.value)} className="bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
            {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400">
          <span className="sr-only">Curso</span>
          <select value={grade} onChange={e => setGrade(e.target.value)} className="bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
            {GRADES.map(g => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
          </select>
        </label>
        {quizOas.length > 0 && (
          <label className="text-xs text-gray-400 min-w-0">
            <span className="sr-only">Objetivo de aprendizaje</span>
            <select value={oa} onChange={e => setOa(e.target.value)} className="bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm max-w-full">
              <option value="">Todos los OA</option>
              {quizOas.map(o => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {draftsElsewhere.length > 0 && tab === 'draft' && counts.draft === 0 && (
        <p className="text-sm text-gray-400 mb-4">
          Hay borradores en:{' '}
          {draftsElsewhere.map((r, i) => (
            <span key={`${r.subject}-${r.grade_level}`}>
              {i > 0 && ', '}
              <button type="button" className="text-brand-light hover:text-white underline-offset-2 hover:underline"
                onClick={() => { setSubject(r.subject); setGrade(r.grade_level); }}>
                {subjectLabel(r.subject)} {GRADE_LABELS[r.grade_level] ?? r.grade_level} ({r.count})
              </button>
            </span>
          ))}
        </p>
      )}

      <CoveragePanel oas={quizOas} selected={oa} onSelect={setOa} />

      <div role="tablist" aria-label="Estado de las preguntas" className="flex gap-1 mb-4 border-b border-gray-800">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.id ? 'border-brand text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {t.label} <span className="tabular-nums text-gray-500">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm mb-4">{error}</p>}

      <div className="space-y-3" aria-busy={loading}>
        {loading && <p className="text-gray-500 text-sm">Cargando…</p>}
        {!loading && questions.length === 0 && (
          <div className="bg-card rounded-2xl p-8 text-center text-gray-500">
            {tab === 'draft' ? 'No hay borradores por revisar con estos filtros.' : tab === 'approved' ? 'No hay preguntas en uso con estos filtros.' : 'No hay preguntas descartadas.'}
          </div>
        )}
        {!loading && questions.map((q, i) => {
          const header = !oa && (i === 0 || questions[i - 1].oa_code !== q.oa_code);
          return (
            <div key={q.id}>
              {header && (
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-5 mb-2">
                  {q.oa_code ? `${q.oa_code} · ${oaLabels[q.oa_code] ?? ''}` : 'Sin OA'}
                </h3>
              )}
              <QuestionCard q={q} {...handlers} />
            </div>
          );
        })}
      </div>

      {editing && (
        <QuestionForm
          initial={editing}
          editingDraft={editing.status === 'draft'}
          oas={editing.subject === subject && editing.grade_level === grade ? quizOas : []}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
