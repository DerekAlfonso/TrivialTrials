import type { SurveyAnswer } from './types';

// Suggests which survey answer a spoken/typed answer most likely matches. Suggestions only:
// the host always makes the final call.

const STOP_WORDS = new Set(['a', 'an', 'the', 'my', 'your', 'some', 'of', 'to', 'and']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(singular)
    .join(' ');
}

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(input: string, candidate: string): number {
  if (!input || !candidate) return 0;
  if (input === candidate) return 1;
  const inWords = input.split(' ');
  const candWords = candidate.split(' ');
  // Whole-word containment ("big towel" vs "towel")
  if (candWords.every((w) => inWords.includes(w)) || inWords.every((w) => candWords.includes(w))) return 0.85;
  const dist = levenshtein(input, candidate);
  const ratio = 1 - dist / Math.max(input.length, candidate.length);
  const overlap = inWords.filter((w) => candWords.includes(w)).length / Math.max(inWords.length, candWords.length);
  return Math.max(ratio * 0.9, overlap * 0.75);
}

export interface MatchSuggestion {
  index: number;
  score: number;
}

export function suggestMatches(input: string, answers: SurveyAnswer[], min = 0.55): MatchSuggestion[] {
  const n = normalize(input);
  if (!n) return [];
  return answers
    .map((a, index) => {
      const forms = [a.text, ...(a.aliases ?? [])].map(normalize);
      return { index, score: Math.max(...forms.map((f) => similarity(n, f))) };
    })
    .filter((s) => s.score >= min)
    .sort((x, y) => y.score - x.score);
}
