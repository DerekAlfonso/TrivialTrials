// Validates data/questions.json. Runs as part of `npm run build`.
// Usage: npm run validate:questions

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { QuestionBank } from '../src/shared/types';

const MIN_QUESTIONS = 100;
const MIN_FAST_MONEY = 10;
const MAX_ANSWER_LENGTH = 24;

const path = fileURLToPath(new URL('../data/questions.json', import.meta.url));
const errors: string[] = [];
let bank: QuestionBank;
try {
  bank = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`✗ Could not parse ${path}: ${(e as Error).message}`);
  process.exit(1);
}

const ids = new Set<string>();
const norm = (s: string) => s.trim().toLowerCase();

if (!Array.isArray(bank.questions)) errors.push('"questions" must be an array');
for (const [n, q] of (bank.questions ?? []).entries()) {
  const at = `${q.id ?? `#${n + 1}`}`;
  if (!q.id || typeof q.id !== 'string') errors.push(`${at}: missing id`);
  else if (ids.has(q.id)) errors.push(`${at}: duplicate id`);
  ids.add(q.id);
  if (!q.text?.trim()) errors.push(`${at}: missing text`);
  if (!Array.isArray(q.use) || !q.use.includes('main')) errors.push(`${at}: "use" must include "main"`);
  if (q.use?.some((u) => u !== 'main' && u !== 'fastMoney')) errors.push(`${at}: unknown "use" value`);
  if (!Number.isInteger(q.surveyed) || q.surveyed <= 0) errors.push(`${at}: "surveyed" must be a positive integer`);
  if (!Array.isArray(q.answers) || q.answers.length < 3 || q.answers.length > 8) {
    errors.push(`${at}: needs 3–8 answers (has ${q.answers?.length ?? 0})`);
    continue;
  }
  const seen = new Set<string>();
  let sum = 0;
  q.answers.forEach((a, i) => {
    if (!a.text?.trim()) errors.push(`${at}: answer ${i + 1} has no text`);
    if (a.text?.length > MAX_ANSWER_LENGTH) errors.push(`${at}: "${a.text}" is longer than ${MAX_ANSWER_LENGTH} chars`);
    if (!Number.isInteger(a.count) || a.count < 1) errors.push(`${at}: "${a.text}" count must be a positive integer`);
    if (i > 0 && a.count > q.answers[i - 1].count) errors.push(`${at}: answers must be sorted by count, highest first`);
    for (const form of [a.text, ...(a.aliases ?? [])]) {
      if (seen.has(norm(form))) errors.push(`${at}: "${form}" appears more than once`);
      seen.add(norm(form));
    }
    sum += a.count;
  });
  if (sum > q.surveyed) errors.push(`${at}: answer counts add up to ${sum}, more than the ${q.surveyed} surveyed`);
}

const total = bank.questions?.length ?? 0;
const fast = bank.questions?.filter((q) => q.use?.includes('fastMoney')).length ?? 0;
if (total < MIN_QUESTIONS) errors.push(`Need at least ${MIN_QUESTIONS} questions (have ${total})`);
if (fast < MIN_FAST_MONEY) errors.push(`Need at least ${MIN_FAST_MONEY} fastMoney questions (have ${fast})`);

if (errors.length) {
  console.error(`✗ data/questions.json has ${errors.length} problem(s):`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`✓ data/questions.json OK: ${total} questions, ${fast} Fast Money-ready.`);
