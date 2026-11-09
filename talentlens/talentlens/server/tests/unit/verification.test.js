import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRONG_RESUME } from './helpers.js';
import { verifyClaims, verifyProfileSkills } from '../../src/services/verification.js';
import { buildProfileFromText } from '../../src/services/profilePipeline.js';

test('links skill claims to resume excerpts and flags unsupported ones', async () => {
  const prof = await buildProfileFromText(STRONG_RESUME);
  const res = await verifyClaims([{ claim: 'Has Docker', skill: 'Docker' }, { claim: 'Has Kubernetes', skill: 'Kubernetes' }], STRONG_RESUME, prof.chunks);
  assert.equal(res[0].supported, true);
  assert.match(res[0].excerpt, /Docker/);
  assert.equal(res[1].supported, false);
});

test('flags skills added without evidence', () => {
  const out = verifyProfileSkills([{ name: 'Python', source: 'parser' }, { name: 'Rust', source: 'candidate' }], STRONG_RESUME);
  assert.equal(out[0].supported, true);
  assert.equal(out[1].supported, false);
});
