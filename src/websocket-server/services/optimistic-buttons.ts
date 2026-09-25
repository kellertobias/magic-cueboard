const FEEDBACK_GRACE_MILLISECONDS = 1500;

/** Keeps a local button decision stable while delayed console snapshots catch up. */
export class OptimisticButtons {
  private pending = new Map<number, { active: boolean; until: number }>();

  predict(number: number, active: boolean, now = Date.now()): void {
    this.pending.set(number, { active, until: now + FEEDBACK_GRACE_MILLISECONDS });
  }

  value(number: number, reported: number, now = Date.now()): number {
    const preview = this.pending.get(number);
    if (!preview) return reported;
    if (now >= preview.until) {
      this.pending.delete(number);
      return reported;
    }
    return preview.active ? 1 : 0;
  }

  clear(): void {
    this.pending.clear();
  }
}
