import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

const SUBJECTS = [
  { value: 'lenguaje', label: 'Lenguaje' },
  { value: 'matematica', label: 'Matemática' },
  { value: 'ciencias', label: 'Ciencias' },
  { value: 'historia', label: 'Historia' },
  { value: 'ingles', label: 'Inglés' },
  { value: 'general', label: 'General' },
];

const GRADES = ['nt1','nt2','1b','2b','3b','4b','5b','6b','7b','8b','general'];

const DIFFICULTIES = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
];

const EMPTY_FORM = {
  subject: 'matematica',
  grade_level: '1b',
  difficulty: 'medium',
  text: '',
  options: ['', '', '', ''],
  correct: '',
  hint: '',
  oa_code: '',
};

export default function QuestionBank() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchQuestions = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSubject) params.set('subject', filterSubject);
    if (filterGrade) params.set('grade_level', filterGrade);
    const res = await client.get(`/api/questions?${params}`);
    setQuestions(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, [filterSubject, filterGrade]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (q) => {
    setForm({
      subject: q.subject,
      grade_level: q.grade_level,
      difficulty: q.difficulty,
      text: q.text,
      options: q.options,
      correct: q.correct,
      hint: q.hint || '',
      oa_code: q.oa_code || '',
    });
    setEditingId(q.id);
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.correct) return setError('Debes marcar la respuesta correcta');
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await client.put(`/api/questions/${editingId}`, form);
      } else {
        await client.post('/api/questions', form);
      }
      setShowForm(false);
      fetchQuestions();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    await client.patch(`/api/questions/${id}/toggle`);
    fetchQuestions();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta pregunta?')) return;
    await client.delete(`/api/questions/${id}`);
    fetchQuestions();
  };

  const setOption = (i, val) => {
    const opts = [...form.options];
    opts[i] = val;
    const newForm = { ...form, options: opts };
    if (form.correct === form.options[i]) newForm.correct = val;
    setForm(newForm);
  };

  const diffLabel = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };
  const diffColor = { easy: 'text-correct', medium: 'text-gold', hard: 'text-wrong' };

  return (
    <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/teacher')} className="text-gray-500 hover:text-gray-300 text-sm mb-1">
            ← Volver
          </button>
          <h1 className="text-2xl font-black text-brand-light">Banco de preguntas</h1>
        </div>
        <button
          onClick={openNew}
          className="bg-brand hover:bg-brand-dark text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          + Nueva pregunta
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          className="bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
        >
          <option value="">Todas las asignaturas</option>
          {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={filterGrade}
          onChange={e => setFilterGrade(e.target.value)}
          className="bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
        >
          <option value="">Todos los niveles</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="text-gray-500 text-sm self-center">
          {loading ? 'Cargando…' : `${questions.length} pregunta${questions.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Question list */}
      <div className="space-y-3">
        {!loading && questions.length === 0 && (
          <div className="bg-card rounded-2xl p-8 text-center text-gray-500">
            No hay preguntas. Crea la primera.
          </div>
        )}
        {questions.map(q => (
          <div key={q.id} className={`bg-card rounded-2xl p-4 border ${q.active ? 'border-gray-800' : 'border-gray-700 opacity-50'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-bold text-brand-light bg-brand/20 px-2 py-0.5 rounded-full">
                    {SUBJECTS.find(s => s.value === q.subject)?.label || q.subject}
                  </span>
                  <span className="text-xs text-gray-500 bg-surface px-2 py-0.5 rounded-full">{q.grade_level}</span>
                  <span className={`text-xs font-semibold ${diffColor[q.difficulty]}`}>{diffLabel[q.difficulty]}</span>
                  {q.oa_code && <span className="text-xs text-gray-600">{q.oa_code}</span>}
                </div>
                <p className="font-semibold text-sm leading-snug">{q.text}</p>
                <p className="text-xs text-correct mt-1">✓ {q.correct}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(q)} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
                  Editar
                </button>
                <button onClick={() => handleToggle(q.id)} className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
                  {q.active ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => handleDelete(q.id)} className="text-wrong/60 hover:text-wrong text-xs px-2 py-1 rounded-lg border border-gray-700 hover:border-wrong/40 transition-colors">
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto">
          <div className="bg-card rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
            <h2 className="text-xl font-black mb-5">
              {editingId ? 'Editar pregunta' : 'Nueva pregunta'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Asignatura</label>
                  <select value={form.subject} onChange={e => setForm({...form, subject: e.target.value})}
                    className="w-full bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                    {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Nivel</label>
                  <select value={form.grade_level} onChange={e => setForm({...form, grade_level: e.target.value})}
                    className="w-full bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Dificultad</label>
                  <select value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value})}
                    className="w-full bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                    {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Código OA (opcional)</label>
                  <input value={form.oa_code} onChange={e => setForm({...form, oa_code: e.target.value})}
                    placeholder="ej: OA3"
                    className="w-full bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Pregunta</label>
                <textarea value={form.text} onChange={e => setForm({...form, text: e.target.value})} required rows={2}
                  className="w-full bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">
                  Alternativas <span className="text-gray-600 font-normal">(marca la correcta)</span>
                </label>
                <div className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={form.correct === opt && opt !== ''}
                        onChange={() => opt && setForm({...form, correct: opt})}
                        className="accent-green-500 w-4 h-4 flex-shrink-0"
                      />
                      <input
                        value={opt}
                        onChange={e => setOption(i, e.target.value)}
                        placeholder={`Alternativa ${i + 1}`}
                        required
                        className="flex-1 bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Pista (opcional)</label>
                <input value={form.hint} onChange={e => setForm({...form, hint: e.target.value})}
                  placeholder="Explicación breve que aparece al revelar la respuesta"
                  className="w-full bg-surface border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600" />
              </div>

              {error && (
                <div className="bg-wrong/20 border border-wrong/40 text-wrong rounded-xl px-4 py-2 text-sm">{error}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
