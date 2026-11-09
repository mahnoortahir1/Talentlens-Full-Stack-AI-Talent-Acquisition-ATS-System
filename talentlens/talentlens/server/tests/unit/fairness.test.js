import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRONG_RESUME, WEAK_RESUME, JOB } from './helpers.js';
import { fairnessCheck } from '../../src/services/fairness.js';

test('changing protected attributes does not change the score', async () => {
  for (const resume of [STRONG_RESUME, WEAK_RESUME]) {
    const r = await fairnessCheck(JOB, resume);
    assert.equal(r.passed, true, JSON.stringify(r.variants));
    assert.equal(r.maxDelta, 0);
    assert.ok(r.variants.length >= 5);
  }
});
