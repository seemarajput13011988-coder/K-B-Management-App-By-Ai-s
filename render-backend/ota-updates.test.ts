import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOtaUpdateResponse, clearOtaReleaseCacheForTests, getOtaUpdateResponse, K_AND_B_OTA_APP_ID, K_AND_B_OTA_REPOSITORY } from './ota-updates.js';

const version = '1.0.12';
const release = {
  tag_name: `nexus-ota-v${version}`,
  draft: false,
  prerelease: false,
  assets: [
    { name: 'kandb-nexus-bundle.zip', browser_download_url: `https://github.com/${K_AND_B_OTA_REPOSITORY}/releases/download/nexus-ota-v${version}/kandb-nexus-bundle.zip` },
    { name: 'kandb-nexus-metadata.json', browser_download_url: `https://github.com/${K_AND_B_OTA_REPOSITORY}/releases/download/nexus-ota-v${version}/kandb-nexus-metadata.json` },
  ],
};
const metadata = { appId: K_AND_B_OTA_APP_ID, version, checksum: 'a'.repeat(64) };
const android = { platform: 'android', app_id: K_AND_B_OTA_APP_ID, version_name: 'builtin' };

test('offers a compatible Android update with a verified-format SHA-256 checksum', () => {
  assert.deepEqual(buildOtaUpdateResponse(android, release, metadata), {
    version,
    url: release.assets[0].browser_download_url,
    checksum: metadata.checksum,
  });
});

test('does not offer updates to other apps or platforms', () => {
  assert.equal('error' in buildOtaUpdateResponse({ ...android, platform: 'ios' }, release, metadata), true);
  assert.equal('error' in buildOtaUpdateResponse({ ...android, app_id: 'other.app' }, release, metadata), true);
});

test('does not reinstall the same or a newer installed bundle', () => {
  assert.equal('error' in buildOtaUpdateResponse({ ...android, version_name: version }, release, metadata), true);
  assert.equal('error' in buildOtaUpdateResponse({ ...android, version_name: '1.1.0' }, release, metadata), true);
});

test('rejects draft, prerelease, malformed, mismatched and untrusted release assets', () => {
  assert.equal('error' in buildOtaUpdateResponse(android, { ...release, draft: true }, metadata), true);
  assert.equal('error' in buildOtaUpdateResponse(android, { ...release, prerelease: true }, metadata), true);
  assert.equal('error' in buildOtaUpdateResponse(android, { ...release, tag_name: 'v1.0.12' }, metadata), true);
  assert.equal('error' in buildOtaUpdateResponse(android, release, { ...metadata, checksum: 'not-a-checksum' }), true);
  assert.equal('error' in buildOtaUpdateResponse(android, release, { ...metadata, appId: 'other.app' }), true);
  const unsafe = { ...release, assets: [{ name: 'kandb-nexus-bundle.zip', browser_download_url: 'https://example.com/bundle.zip' }] };
  assert.equal('error' in buildOtaUpdateResponse(android, unsafe, metadata), true);
});

test('checks GitHub releases and metadata using the self-hosted update contract', async () => {
  clearOtaReleaseCacheForTests();
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/releases/latest')) {
      return new Response(JSON.stringify(release), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(metadata), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const result = await getOtaUpdateResponse(android, fetcher, K_AND_B_OTA_REPOSITORY);
  assert.deepEqual(result, { version, url: release.assets[0].browser_download_url, checksum: metadata.checksum });
  assert.equal(calls.length, 2);
  clearOtaReleaseCacheForTests();
});

test('fails closed when GitHub does not have a valid latest release', async () => {
  clearOtaReleaseCacheForTests();
  const fetcher = (async () => new Response('not found', { status: 404 })) as typeof fetch;
  await assert.rejects(() => getOtaUpdateResponse(android, fetcher, K_AND_B_OTA_REPOSITORY), /HTTP 404/);
  clearOtaReleaseCacheForTests();
});
