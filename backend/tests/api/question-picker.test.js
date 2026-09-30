import { describe, it, expect } from 'vitest';

const { rankCandidates, LEVEL_TARGETS } = await import('../../src/services/questionPicker.js');

const q = (id, rating, extra = {}) => ({ id, rating, grade_level: '5b', oa_code: 'OA20', ...extra });
const ladder = [q('a', -2), q('b', -1), q('c', 0), q('d', 1), q('e', 2), q('f', 3)];
const noJitter = () => 0;

function pick(target, candidates = ladder, { used = [], students = [] } = {}) {
  return rankCandidates(candidates, students, { target, count: 5, usedIds: new Set(used), random: noJitter }).map(r => r.q.id);
}

describe('selección de preguntas según exigencia', () => {
  it('repaso deja fuera la más difícil y desafío la más fácil', () => {
    expect(pick(LEVEL_TARGETS.repaso)).not.toContain('f');
    expect(pick(LEVEL_TARGETS.desafio)).not.toContain('a');
  });

  it('ordena la ronda de la más fácil a la más difícil', () => {
    expect(pick(LEVEL_TARGETS.ajustado)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('prefiere las no mostradas y deja el relleno general al final', () => {
    const candidates = [...ladder, q('g', 0, { grade_level: 'general', oa_code: null })];
    expect(pick(LEVEL_TARGETS.ajustado, candidates, { used: ['c', 'd'] })).toEqual(expect.arrayContaining(['a', 'b', 'e', 'f', 'g']));
    expect(pick(LEVEL_TARGETS.ajustado, candidates)).not.toContain('g');
  });

  it('usa la habilidad del curso: a un curso fuerte en el OA le toca lo más difícil', () => {
    const strong = [{ subject: 1, oas: new Map([['5b|OA20', 2]]) }];
    const picked = pick(LEVEL_TARGETS.ajustado, ladder, { students: strong });
    expect(picked).not.toContain('a');
    expect(picked).toContain('f');
  });
});
