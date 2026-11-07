export const K_AND_B_OTA_APP_ID = 'kandbnet.service2010';
export const K_AND_B_OTA_REPOSITORY = 'seemarajput13011988-coder/K-B-Management-App-By-Ai-s';

type AppInfo = {
  platform?: unknown;
  app_id?: unknown;
  version_name?: unknown;
};

type ReleaseAsset = {
  name?: unknown;
  browser_download_url?: unknown;
};

type GitHubRelease = {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: ReleaseAsset[];
};

type OtaMetadata = {
  appId?: unknown;
  version?: unknown;
  checksum?: unknown;
};

export type OtaUpdateResponse =
  | { version: string; url: string; checksum: string }
  | { error: 'no_new_version_available'; message: string };

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(value: unknown): [number, number, number, string] | null {
  if (typeof value !== 'string') return null;
  const match = semverPattern.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] || ''];
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1;
  if (!b[3]) return -1;
  return a[3].localeCompare(b[3], 'en');
}

function isTrustedReleaseAsset(value: unknown, repository: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.startsWith(`/${repository}/releases/download/`);
  } catch {
    return false;
  }
}

export function buildOtaUpdateResponse(
  appInfo: AppInfo,
  release: GitHubRelease,
  metadata: OtaMetadata,
  repository = K_AND_B_OTA_REPOSITORY,
): OtaUpdateResponse {
  const noUpdate: OtaUpdateResponse = {
    error: 'no_new_version_available',
    message: 'No compatible K&B Nexus update is available.',
  };

  if (appInfo.platform !== 'android' || appInfo.app_id !== K_AND_B_OTA_APP_ID) return noUpdate;
  if (release.draft === true || release.prerelease === true) return noUpdate;

  const version = typeof metadata.version === 'string' ? metadata.version : '';
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  const checksum = typeof metadata.checksum === 'string' ? metadata.checksum.toLowerCase() : '';
  if (!parseVersion(version) || tag !== `nexus-ota-v${version}`) return noUpdate;
  if (metadata.appId !== K_AND_B_OTA_APP_ID || !/^[a-f0-9]{64}$/.test(checksum)) return noUpdate;

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const bundle = assets.find(asset => asset.name === 'kandb-nexus-bundle.zip');
  if (!bundle || !isTrustedReleaseAsset(bundle.browser_download_url, repository)) return noUpdate;

  const current = typeof appInfo.version_name === 'string' ? appInfo.version_name : 'builtin';
  if (current !== 'builtin' && parseVersion(current) && compareVersions(current, version) >= 0) return noUpdate;

  return { version, url: bundle.browser_download_url, checksum };
}

type CachedRelease = { expiresAt: number; release: GitHubRelease; metadata: OtaMetadata; repository: string };
let cachedRelease: CachedRelease | null = null;
let pendingRelease: Promise<CachedRelease> | null = null;

async function fetchLatestRelease(fetcher: typeof fetch, repository: string): Promise<CachedRelease> {
  const response = await fetcher(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GitHub release lookup returned HTTP ${response.status}.`);
  const release = await response.json() as GitHubRelease;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const metadataAsset = assets.find(asset => asset.name === 'kandb-nexus-metadata.json');
  if (!metadataAsset || !isTrustedReleaseAsset(metadataAsset.browser_download_url, repository)) {
    throw new Error('The latest K&B OTA release has no valid metadata asset.');
  }
  const metadataResponse = await fetcher(metadataAsset.browser_download_url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!metadataResponse.ok) throw new Error(`K&B OTA metadata returned HTTP ${metadataResponse.status}.`);
  const metadata = await metadataResponse.json() as OtaMetadata;
  return { expiresAt: Date.now() + 120000, release, metadata, repository };
}

export async function getOtaUpdateResponse(
  appInfo: AppInfo,
  fetcher: typeof fetch = fetch,
  repository = process.env.OTA_RELEASE_REPOSITORY || K_AND_B_OTA_REPOSITORY,
): Promise<OtaUpdateResponse> {
  if (appInfo.platform !== 'android' || appInfo.app_id !== K_AND_B_OTA_APP_ID) {
    return { error: 'no_new_version_available', message: 'No compatible K&B Nexus update is available.' };
  }

  if (cachedRelease && cachedRelease.expiresAt > Date.now() && cachedRelease.repository === repository) {
    return buildOtaUpdateResponse(appInfo, cachedRelease.release, cachedRelease.metadata, repository);
  }

  if (!pendingRelease) {
    pendingRelease = fetchLatestRelease(fetcher, repository).then(value => {
      cachedRelease = value;
      return value;
    }).finally(() => { pendingRelease = null; });
  }

  const latest = await pendingRelease;
  return buildOtaUpdateResponse(appInfo, latest.release, latest.metadata, repository);
}

export function clearOtaReleaseCacheForTests(): void {
  cachedRelease = null;
  pendingRelease = null;
}
