import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSkill, findSkillsInText, relationStrength, impliedBy } from '../../src/services/skills.js';

test('normalises equivalent skill names', () => {
  assert.equal(normalizeSkill('JS'), 'JavaScript');
  assert.equal(normalizeSkill('javascript'), 'JavaScript');
  assert.equal(normalizeSkill('Postgres'), 'PostgreSQL');
  assert.equal(normalizeSkill('k8s'), 'Kubernetes');
  assert.equal(normalizeSkill('ReactJS'), 'React');
  assert.equal(normalizeSkill('  node js '), 'Node.js');
});

test('keeps unknown skills, title-cased', () => {
  assert.equal(normalizeSkill('quantum basket weaving'), 'Quantum Basket Weaving');
  assert.equal(normalizeSkill(''), null);
});

test('finds skills in text with the line that mentions them', () => {
  const hits = findSkillsInText('Built REST APIs with DRF\nDeployed with docker-compose on Ubuntu');
  const names = hits.map((h) => h.name);
  assert.ok(names.includes('Django'));
  assert.ok(names.includes('REST API'));
  assert.ok(names.includes('Docker'));
  assert.ok(names.includes('Linux'));
  assert.equal(hits.find((h) => h.name === 'Docker').evidence[0], 'Deployed with docker-compose on Ubuntu');
});

test('avoids common false positives for ambiguous words', () => {
  const names = findSkillsInText('Go to market strategy in Spring 2021. We react quickly to change.').map((h) => h.name);
  assert.ok(!names.includes('Go'));
  assert.ok(!names.includes('Spring'));
  assert.ok(!names.includes('React'));
});

test('symbol-heavy skills match on boundaries', () => {
  const names = findSkillsInText('Languages: C++, C#, .NET Core and Node.js').map((h) => h.name);
  for (const s of ['C++', 'C#', '.NET', 'Node.js']) assert.ok(names.includes(s), s);
});

test('relations and implications', () => {
  assert.ok(relationStrength('Django', 'Flask') > 0.4);
  assert.equal(relationStrength('Django', 'React'), 0);
  assert.ok(impliedBy('Django').includes('Python'));
});
