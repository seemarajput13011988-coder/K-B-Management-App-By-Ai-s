import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOtaDecision, isValidOtaManifest } from './ota.js';

const manifest = {
  appId: 'kandbnet.service2010',
  version: '1.0.42',
  checksum: 'a'.repeat(64),
};

test('accepts only a manifest for the Nexus app with semver and SHA-256', () => {
  assert.equal(isValidOtaManifest(manifest), true);
  assert.equal(isValidOtaManifest({ ...manifest, appId: 'other.app' }), false);
  assert.equal(isValidOtaManifest({ ...manifest, version: 'latest' }), false);
  assert.equal(isValidOtaManifest({ ...manifest, checksum: 'bad' }), false);
  assert.equal(isValidOtaManifest(null), false);
});

test('returns no update when no release exists', () => {
  assert.deepEqual(buildOtaDecision('builtin', null, null), {
    message: 'No OTA update is currently published.',
  });
});

test('returns no update when the installed bundle is current', () => {
  assert.deepEqual(buildOtaDecision('1.0.42', manifest, 'https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/download/x/nexus-update.zip'), {
    message: 'No update is available.',
  });
});

test('returns a checksum-verified release URL for an older bundle', () => {
  assert.deepEqual(buildOtaDecision('builtin', manifest, 'https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/download/x/nexus-update.zip'), {
    version: '1.0.42',
    url: 'https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/download/x/nexus-update.zip',
    checksum: 'a'.repeat(64),
  });
});

test('rejects insecure and untrusted bundle hosts', () => {
  const insecure = buildOtaDecision('builtin', manifest, 'http://github.com/update.zip');
  const untrusted = buildOtaDecision('builtin', manifest, 'https://evil.example/update.zip');
  assert.ok('message' in insecure);
  assert.ok('message' in untrusted);
  assert.match(insecure.message, /not trusted/);
  assert.match(untrusted.message, /not trusted/);
});

test('does not downgrade a device with a newer semantic version', () => {
  assert.deepEqual(buildOtaDecision('1.0.43', manifest, 'https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/download/x/nexus-update.zip'), {
    message: 'No update is available.',
  });
  assert.deepEqual(buildOtaDecision('2.0.0', manifest, 'https://github.com/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/download/x/nexus-update.zip'), {
    message: 'No update is available.',
  });
});

test('rejects a valid GitHub URL outside the trusted repository release path', () => {
  const decision = buildOtaDecision('builtin', manifest, 'https://github.com/another-owner/another-repo/releases/download/x/nexus-update.zip');
  assert.ok('message' in decision);
  assert.match(decision.message, /not trusted/);
});
