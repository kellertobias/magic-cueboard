import { EventEmitter } from "node:events";

export interface SPLMeasurement {
  measured: number;
  timestamp: string;
  mode: string;
  freqMode: string;
  range: string;
}

export interface SPLPublication { topic: string; value: unknown; retain: boolean }

/** Stable MQTT contract for consumers such as ToskLight, plus the legacy topics. */
export function splPublications(data: SPLMeasurement): SPLPublication[] {
  return [
    { topic: "spl/value", value: data.measured, retain: true },
    { topic: "spl/mode", value: data.freqMode, retain: true },
    { topic: "tosklight/spl", value: data, retain: true },
    { topic: "tosklight/spl/value", value: data.measured, retain: true },
    { topic: "tosklight/spl/unit", value: data.freqMode, retain: true },
    { topic: "tosklight/spl/timestamp", value: data.timestamp, retain: true },
    { topic: "tosklight/spl/availability", value: "online", retain: true },
  ];
}

export function decodeSPLMeasurement(value: unknown, now = new Date()): SPLMeasurement {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const raw = typeof value === "number" || typeof value === "string"
    ? value
    : record.measured ?? record.value ?? record.state ?? (record.data as Record<string, unknown> | undefined)?.measured;
  const measured = Number(raw);
  if (!Number.isFinite(measured) || measured < 0 || measured > 200) throw new Error("SPL API returned an invalid measurement.");
  const attributes = record.attributes && typeof record.attributes === "object" ? record.attributes as Record<string, unknown> : {};
  return {
    measured,
    timestamp: String(record.timestamp ?? record.last_updated ?? now.toISOString()),
    mode: String(record.mode ?? "external"),
    freqMode: String(record.freqMode ?? record.frequency ?? attributes.unit_of_measurement ?? "dBA"),
    range: String(record.range ?? "auto"),
  };
}

export class SPLApiService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private controller: AbortController | null = null;
  private running = false;

  constructor(private endpoint: string | null, private intervalMilliseconds = 250) {
    super();
    if (endpoint) {
      const url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("SPL_API_URL must use http:// or https://");
    }
    if (!Number.isInteger(intervalMilliseconds) || intervalMilliseconds < 100) throw new Error("SPL_API_INTERVAL_MS must be at least 100.");
  }

  public start(): void {
    if (!this.endpoint || this.running) return;
    this.running = true;
    void this.poll();
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.endpoint) return;
    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), Math.max(1000, this.intervalMilliseconds * 3));
    try {
      const response = await fetch(this.endpoint, { headers: { accept: "application/json" }, signal: this.controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`SPL API returned HTTP ${response.status}.`);
      this.emit("data", decodeSPLMeasurement(await response.json()));
    } catch (error) {
      this.emit("warning", error instanceof Error ? error : new Error(String(error)));
    } finally {
      clearTimeout(timeout);
      this.controller = null;
      if (this.running) this.timer = setTimeout(() => void this.poll(), this.intervalMilliseconds);
    }
  }

  public stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
  }
}
