import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, normalizePhone, normalizeName, findDuplicatePairs } from '../../src/services/duplicates.js';
import { STRONG_RESUME, WEAK_RESUME } from './helpers.js';

test('normalises contact details', () => {
  assert.equal(normalizeEmail('A.Yesha.Malik+jobs@GMAIL.com'), 'ayeshamalik@gmail.com');
  assert.equal(normalizeEmail('first.last@company.com'), 'first.last@company.com');
  assert.equal(normalizePhone('+92 321 5550192'), normalizePhone('0321-5550192'));
  assert.equal(normalizeName('Malik,  Ayesha'), normalizeName('ayesha malik'));
});

test('flags likely duplicates with reasons, ignores different people', () => {
  const pairs = findDuplicatePairs([
    { id: 'a', name: 'Ayesha Malik', email: 'ayesha.malik@gmail.com', phone: '+92 321 5550192', text: STRONG_RESUME },
    { id: 'b', name: 'Ayesha Malik', email: 'ayeshamalik@gmail.com', phone: '0321 5550192', text: STRONG_RESUME.replace('80k', '85k') },
    { id: 'c', name: 'Sara Iqbal', email: 'sara@yahoo.com', phone: '+92 333 4445566', text: WEAK_RESUME },
  ]);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a, pairs[0].b], ['a', 'b']);
  assert.ok(pairs[0].reasons.some((r) => /email/.test(r)));
  assert.ok(pairs[0].reasons.some((r) => /similar/.test(r)));
});
