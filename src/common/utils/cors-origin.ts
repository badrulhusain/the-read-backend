const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createCorsOriginChecker(
  configuredOrigins: string | undefined,
  nodeEnv: string | undefined,
) {
  const allowedOrigins = new Set(
    (configuredOrigins ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
  const allowDevelopmentLoopback = nodeEnv !== 'production';

  return (origin: string | undefined): boolean => {
    if (!origin) return true;

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.has(normalizedOrigin)) return true;
    if (!allowDevelopmentLoopback) return false;

    try {
      const url = new URL(normalizedOrigin);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        LOOPBACK_HOSTS.has(url.hostname)
      );
    } catch {
      return false;
    }
  };
}
