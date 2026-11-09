import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirementsRuleBased, extractRequirements } from '../../src/services/jobExtraction.js';

const JD = `We are hiring a Backend Developer.
Requirements:
- 3+ years of professional experience with Python and Django
- Strong PostgreSQL skills
- Docker for deployments
Nice to have:
- Kubernetes, AWS
Bachelor's degree in Computer Science or related field`;

test('separates required and preferred skills with importance', () => {
  const r = extractRequirementsRuleBased(JD);
  assert.deepEqual(r.requiredSkills.map((s) => s.name).sort(), ['Django', 'Docker', 'PostgreSQL', 'Python']);
  assert.deepEqual(r.preferredSkills.map((s) => s.name).sort(), ['AWS', 'Kubernetes']);
  assert.equal(r.requiredSkills.find((s) => s.name === 'PostgreSQL').importance, 5);
  assert.ok(r.preferredSkills.every((s) => s.importance < 4));
});

test('extracts experience and qualifications', () => {
  const r = extractRequirementsRuleBased(JD);
  assert.equal(r.minExperienceYears, 3);
  assert.match(r.qualifications[0], /Bachelor/);
});

test('no years mentioned means zero, not Infinity', () => {
  assert.equal(extractRequirementsRuleBased('We need a React developer with good CSS skills for our team.').minExperienceYears, 0);
});

test('falls back to rules when no LLM is configured', async () => {
  const r = await extractRequirements(JD);
  assert.equal(r.source, 'rules');
});
