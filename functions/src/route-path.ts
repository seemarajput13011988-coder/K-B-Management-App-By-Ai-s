export function routePath(path: string): string {
  const normalized = path.replace(/\\/+$/, '') || '/';
  // Direct Cloud Functions URLs remove the exported function name from req.path,
  // while Firebase Hosting rewrites preserve the incoming /api prefix.
  if (normalized === '/api' || normalized.startsWith('/api/')) return normalized;
  return normalized === '/' ? normalized : `/api${normalized}`;
}
