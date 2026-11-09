import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRONG_RESUME, WEAK_RESUME, JOB } from './helpers.js';
import { buildProfileFromText } from '../../src/services/profilePipeline.js';
import { scoreCandidate, scoringView } from '../../src/services/matcher.js';
import { embed } from '../../src/services/embeddings.js';
import { generateQuestions, QUESTION_MIX } from '../../src/services/questions.js';

async function setup(text) {
  const prof = await buildProfileFromText(text);
  const assessment = await scoreCandidate(JOB, scoringView(prof), { embedFn: embed });
  return { parsed: prof.parsed, assessment };
}
const countBy = (qs) => qs.reduce((m, q) => ({ ...m, [q.type]: (m[q.type] || 0) + 1 }), {});

test('generates the required mix (2 technical, 2 project, 1 scenario, 1 behavioral) from the CV', async () => {
  const { parsed, assessment } = await setup(STRONG_RESUME);
  const qs = await generateQuestions(JOB, parsed, assessment);
  assert.deepEqual(countBy(qs), QUESTION_MIX);
  const project = qs.filter((q) => q.type === 'project');
  assert.ok(project.every((q) => parsed.projects.some((p) => p.name === q.projectRef)), 'only real projects referenced');
  const cvSkills = new Set(parsed.skills.map((s) => s.name));
  assert.ok(qs.filter((q) => q.type === 'technical').every((q) => cvSkills.has(q.skill)), 'technical questions are about CV skills');
  assert.ok(qs.every((q) => q.guideline && q.id));
  assert.ok(qs.every((q) => !/tell me about yourself/i.test(q.text)), 'no generic questions');
});

test('regenerating 3 times gives 3 different sets with no repeated questions', async () => {
  const { parsed, assessment } = await setup(STRONG_RESUME);
  const previous = [];
  const sets = [];
  for (let i = 0; i < 3; i++) {
    const qs = await generateQuestions(JOB, parsed, assessment, { previousQuestions: previous });
    for (const q of qs) assert.ok(!previous.includes(q.text), `repeated: ${q.text}`);
    previous.push(...qs.map((q) => q.text));
    sets.push(qs);
  }
  assert.equal(new Set(previous).size, previous.length);
  assert.ok(sets.every((s) => s.length === 6));
});

test('weak CV still gets CV-grounded questions of every type', async () => {
  const { parsed, assessment } = await setup(WEAK_RESUME);
  const qs = await generateQuestions(JOB, parsed, assessment);
  for (const t of Object.keys(QUESTION_MIX)) assert.ok(qs.some((q) => q.type === t), `missing ${t}`);
});
