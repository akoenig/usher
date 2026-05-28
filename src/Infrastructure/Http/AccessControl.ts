export function isAdminRequestAllowed(sourceIp: string) {
  return isLoopback(sourceIp);
}

export function isCallRequestAllowed(sourceIp: string, allowedCallerIps: ReadonlyArray<string>) {
  return isLoopback(sourceIp) || allowedCallerIps.includes(sourceIp);
}

export function normalizeSourceIp(sourceIp: string) {
  if (sourceIp.startsWith("::ffff:")) {
    return sourceIp.slice("::ffff:".length);
  }

  return sourceIp;
}

function isLoopback(sourceIp: string) {
  const normalized = normalizeSourceIp(sourceIp);

  return normalized === "127.0.0.1" || normalized === "::1";
}
