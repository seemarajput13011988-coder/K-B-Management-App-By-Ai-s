export type OtaManifest = {
  appId: string;
  version: string;
  checksum: string;
};

export type OtaDecision =
  | { version: string; url: string; checksum: string }
  | { message: string };

const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/i;

export function isValidOtaManifest(value: unknown): value is OtaManifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.appId === 'kandbnet.service2010'
    && typeof item.version === 'string'
    && SEMVER.test(item.version)
    && typeof item.checksum === 'string'
    && SHA256.test(item.checksum);
}

export function buildOtaDecision(
  currentVersion: unknown,
  manifest: OtaManifest | null,
  bundleUrl: unknown,
): OtaDecision {
  if (!manifest || typeof bundleUrl !== 'string') {
    return { message: 'No OTA update is currently published.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(bundleUrl);
  } catch {
    return { message: 'The published OTA bundle URL is invalid.' };
  }
  const trustedReleasePath = '/seemarajput13011988-coder/K-B-Management-App-By-Ai-s/releases/';
  const trustedAssetPath = parsed.pathname.startsWith(trustedReleasePath + 'download/')
    || parsed.pathname.startsWith(trustedReleasePath + 'latest/download/');
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || !trustedAssetPath) {
    return { message: 'The published OTA bundle host is not trusted.' };
  }
  if (typeof currentVersion === 'string' && SEMVER.test(currentVersion)) {
    const current = currentVersion.split('.').map(Number);
    const available = manifest.version.split('.').map(Number);
    const comparison = current[0] - available[0] || current[1] - available[1] || current[2] - available[2];
    if (comparison >= 0) return { message: 'No update is available.' };
  }
  return { version: manifest.version, url: parsed.toString(), checksum: manifest.checksum.toLowerCase() };
}
