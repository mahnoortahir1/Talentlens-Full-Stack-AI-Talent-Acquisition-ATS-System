import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeText, totalExperienceMonths, joinWrappedLines, chunkText } from '../../src/services/resumeParser.js';
import { STRONG_RESUME } from './helpers.js';

test('extracts contact details', () => {
  const r = parseResumeText(STRONG_RESUME);
  assert.equal(r.status, 'parsed');
  assert.equal(r.name, 'Ayesha Malik');
  assert.equal(r.email, 'ayesha.malik@gmail.com');
  assert.match(r.phone, /321 5550192/);
  assert.ok(r.links.some((l) => l.includes('github.com/ayeshamalik')));
});

test('extracts normalised skills with evidence', () => {
  const r = parseResumeText(STRONG_RESUME);
  const names = r.skills.map((s) => s.name);
  for (const s of ['Python', 'Django', 'PostgreSQL', 'Docker']) assert.ok(names.includes(s), s);
  assert.ok(r.skills.every((s) => s.evidence.length > 0), 'every skill links to a resume line');
});

test('extracts experience entries and total years', () => {
  const r = parseResumeText(STRONG_RESUME);
  assert.equal(r.experience.length, 2);
  assert.equal(r.experience[0].title, 'Software Engineer');
  assert.equal(r.experience[0].company, 'Arbisoft');
  assert.equal(r.experience[1].company, 'Systems Ltd');
  assert.ok(r.totalExperienceYears >= 5 && r.totalExperienceYears <= 5.3, String(r.totalExperienceYears));
});

test('overlapping jobs are not double counted', () => {
  const m = totalExperienceMonths([
    { start: new Date(2020, 0, 1), end: new Date(2020, 11, 1) },
    { start: new Date(2020, 5, 1), end: new Date(2021, 5, 1) },
  ]);
  assert.equal(m, 18);
});

test('extracts education and projects', () => {
  const r = parseResumeText(STRONG_RESUME);
  assert.equal(r.education[0].degree, 'Bachelor');
  assert.equal(r.education[0].year, 2019);
  assert.equal(r.projects[0].name, 'ClinicQ');
  assert.ok(r.projects[0].skills.includes('Django'));
});

test('removes protected attributes and identity from the scoring text', () => {
  const r = parseResumeText(`${STRONG_RESUME.split('\n')[0]}\nGender: Female\nDate of Birth: 1 Jan 2000\nReligion: Islam\n${STRONG_RESUME.split('\n').slice(1).join('\n')}`);
  assert.equal(r.protectedLines.length, 3);
  assert.ok(!/Gender|Religion|Date of Birth/.test(r.sanitizedText));
  assert.ok(!r.sanitizedText.includes('Ayesha Malik'));
  assert.ok(!r.sanitizedText.includes('ayesha.malik@gmail.com'));
});

test('does not mistake technical phrases for protected attributes', () => {
  const r = parseResumeText(`${STRONG_RESUME}\n- Fixed race conditions in a single page application`);
  assert.equal(r.protectedLines.length, 0);
});

test('handles empty and near-empty documents gracefully', () => {
  assert.equal(parseResumeText('').status, 'empty');
  const r = parseResumeText('   \n  scan  \n');
  assert.equal(r.status, 'empty');
  assert.match(r.warnings[0], /scanned/);
});

test('warns about missing sections', () => {
  const r = parseResumeText('John Smith\njohn@example.com\nI like Python and building things with Django every day.');
  assert.ok(r.warnings.some((w) => /Experience/.test(w)));
});

test('re-joins lines wrapped by PDF extraction', () => {
  const out = joinWrappedLines(['ClinicQ: Django + PostgreSQL appointment booking system with Celery reminders, deployed', 'in Docker', 'Skills']);
  assert.deepEqual(out, ['ClinicQ: Django + PostgreSQL appointment booking system with Celery reminders, deployed in Docker', 'Skills']);
});

test('chunks text by section for semantic indexing', () => {
  const r = parseResumeText(STRONG_RESUME);
  const chunks = chunkText(r.sanitizedText, r.sections);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.some((c) => c.section === 'experience'));
});
