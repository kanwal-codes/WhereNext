export function withProviderTimeout(signal: AbortSignal | undefined, timeoutMs = 10_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
