export function systemMetricsAreFresh(receivedAt: number | null, now: number, ageMilliseconds = 0): boolean {
  return receivedAt !== null && Number.isFinite(ageMilliseconds) && ageMilliseconds >= 0 &&
    now - receivedAt + ageMilliseconds < 10000;
}
