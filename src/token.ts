export function consumeTrackingToken(loc: { pathname: string }, replace: (path: string) => void): string | null {
  const match = /^\/t\/([^/]+)$/.exec(loc.pathname);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  replace("/");
  return token;
}
