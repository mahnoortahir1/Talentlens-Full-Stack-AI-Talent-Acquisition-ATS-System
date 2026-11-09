import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRONG_RESUME, WEAK_RESUME, JOB } from './helpers.js';
import { buildProfileFromText } from '../../src/services/profilePipeline.js';
import { scoreCandidate, scoringView } from '../../src/services/matcher.js';
import { embed } from '../../src/services/embeddings.js';

const score = async (text, job = JOB, opts = {}) => scoreCandidate(job, scoringView(await buildProfileFromText(text)), { embedFn: embed, ...opts });

test('ranks a well-matched candidate above a weak one', async () => {
  const strong = await score(STRONG_RESUME);
  const weak = await score(WEAK_RESUME);
  assert.ok(strong.score >= 75, `strong ${strong.score}`);
  assert.ok(weak.score <= 35, `weak ${weak.score}`);
  assert.ok(strong.score > weak.score + 30);
});

test('score is bounded and breakdown adds up', async () => {
  const r = await score(STRONG_RESUME);
  assert.ok(r.score >= 0 && r.score <= 100);
  const sum = Object.values(r.breakdown).reduce((a, b) => a + b.contribution, 0);
  assert.ok(Math.abs(sum - r.score) <= 1, `${sum} vs ${r.score}`);
});

test('every matched skill carries evidence and a match type', async () => {
  const r = await score(STRONG_RESUME);
  assert.deepEqual(r.matchedSkills.filter((m) => m.required).map((m) => m.skill).sort(), ['Django', 'Docker', 'PostgreSQL', 'Python']);
  for (const m of r.matchedSkills) {
    assert.ok(m.evidence.length > 0, m.skill);
    assert.ok(['exact', 'implied', 'related', 'semantic', 'semantic-weak', 'self-reported'].includes(m.matchedBy));
  }
});

test('related skills earn partial, explained credit (Flask for Django, MySQL for PostgreSQL)', async () => {
  const r = await score(`Dev\nSkills\nPython, Flask, MySQL\nExperience\nDeveloper at X\nJan 2019 - Jan 2024\n- Built Flask APIs on MySQL`);
  const pg = [...r.matchedSkills, ...r.gaps].find((x) => x.skill === 'PostgreSQL');
  assert.ok(pg.credit > 0 && pg.credit < 1, 'partial credit');
  assert.ok(r.explanation.some((e) => /related skill MySQL/.test(e)) || pg.type === 'weak_evidence');
});

test('distinguishes missing evidence from confirmed absence', async () => {
  const r1 = await score(WEAK_RESUME);
  assert.equal(r1.gaps.find((g) => g.skill === 'Docker').type, 'no_evidence');
  const r2 = await score(WEAK_RESUME, JOB, { recruiterAbsent: ['Docker'] });
  assert.equal(r2.gaps.find((g) => g.skill === 'Docker').type, 'confirmed_absent');
});

test('custom weights change the score', async () => {
  const base = await score(WEAK_RESUME);
  const qualHeavy = await score(WEAK_RESUME, { ...JOB, weights: { skills: 10, experience: 10, projects: 10, qualifications: 70 } });
  assert.notEqual(base.score, qualHeavy.score);
  assert.equal(qualHeavy.weights.qualifications, 70);
});

test('suggests learning areas for gaps', async () => {
  const r = await score(WEAK_RESUME);
  assert.ok(r.learningAreas.length > 0);
  assert.ok(r.learningAreas.some((l) => /Docker|PostgreSQL|Django|Python/.test(l)));
});

test('self-reported skills without evidence are flagged', async () => {
  const prof = await buildProfileFromText(WEAK_RESUME);
  const view = scoringView({ ...prof, skillCorrections: [{ name: 'Docker', action: 'add', by: 'candidate' }] });
  const r = await scoreCandidate(JOB, view, { embedFn: embed });
  const d = r.matchedSkills.find((m) => m.skill === 'Docker');
  assert.equal(d.matchedBy, 'self-reported');
  assert.ok(r.flags.some((f) => f.skill === 'Docker'));
});
