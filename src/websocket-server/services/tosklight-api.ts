import { EventEmitter } from "node:events";
import type { WindowsMagicQSnapshot } from "./windows-magicq";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function hex(value: unknown): string | null { const match = String(value ?? "").match(/^#?([0-9a-f]{6})$/i); return match ? match[1].toLowerCase() : null; }

export function normalizeToskLightSurface(bootstrap: unknown, overview: unknown): WindowsMagicQSnapshot {
  const boot = record(bootstrap), data = record(overview), activeShow = record(boot.active_show);
  const pageNumber = Number(data.active_page) || 1;
  const page = (Array.isArray(data.pages) ? data.pages : []).map(record).find(item => Number(item.number) === pageNumber) ?? {};
  const slots = record(page.slots), pool = new Map((Array.isArray(data.pool) ? data.pool : []).map(value => { const item = record(value); return [Number(item.number), item]; }));
  const activeNumbers = new Set<number>();
  for (const value of Array.isArray(data.active) ? data.active : []) { const item = record(value); const identity = record(item.playback_identity); const number = Number(item.playback_number ?? identity.playback_number ?? identity.number); if (Number.isInteger(number)) activeNumbers.add(number); }
  const executors: WindowsMagicQSnapshot["executors"] = {};
  for (let number = 1; number <= 42; number++) {
    const playbackNumber = Number(slots[String(number)] ?? slots[number]);
    const playback = pool.get(playbackNumber);
    if (!playback) continue;
    const buttons = Array.isArray(playback.buttons) ? playback.buttons.map(value => String(value).toLowerCase()) : [];
    // The external Cueboard is one button per slot and therefore drives the
    // first configured playback button, exactly like the Windows bridge.
    const flash = buttons[0] === "flash";
    executors[number] = { number, name: String(playback.name ?? `Playback ${number}`), type: number > 40 || playback.has_fader === true ? (number > 40 ? "fader" : flash ? "flash" : "toggle") : flash ? "flash" : "toggle", color: hex(playback.color), dotColor: null, value: activeNumbers.has(playbackNumber) ? 1 : 0, active: activeNumbers.has(playbackNumber), mode: flash ? "FL" : "CS" };
  }
  return { type: "surface-snapshot", schemaVersion: 2, source: "tosklight", connected: true, page: 1, showName: typeof activeShow.name === "string" ? activeShow.name : null, executors, layoutMode: "new" };
}

export function toskLightExecutorAction(page: number, number: number, phase: "press" | "release" | "click") {
  return {
    request_id: `magic-cueboard-${crypto.randomUUID()}`,
    address: { kind: "explicit_page", page, slot: number },
    action: { type: "configured_button", number: 1, pressed: phase !== "release" },
    surface: "physical",
  };
}

export class ToskLightApiService extends EventEmitter {
  private token: string | null = null;
  private deskId: string | null = null;
  private showId: string | null = null;
  private activePage = 1;
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(private baseUrl: string, private username = "Magic Cueboard", private intervalMilliseconds = 500) {
    super();
    const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error("TOSKLIGHT_API_URL must use http:// or https://");
    this.baseUrl = url.toString().replace(/\/$/, "");
  }
  public start(): void { this.stopping = false; void this.poll(); }
  private async request(path: string, init: RequestInit = {}, authenticated = true): Promise<unknown> {
    const headers = new Headers(init.headers); headers.set("accept", "application/json");
    if (authenticated && this.token) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, cache: "no-store" });
    if (!response.ok) throw new Error(`ToskLight ${path} returned HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }
  private async login(): Promise<void> {
    const session = record(await this.request("/api/v2/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: this.username }) }, false));
    if (typeof session.token !== "string" || typeof record(session.desk).id !== "string") throw new Error("ToskLight session response is invalid.");
    this.token = session.token; this.deskId = String(record(session.desk).id);
  }
  private async poll(): Promise<void> {
    if (this.stopping) return;
    try {
      if (!this.token) await this.login();
      const [bootstrap, overview] = await Promise.all([this.request("/api/v2/bootstrap", {}, false), this.request("/api/v2/playback-overview")]);
      const snapshot = normalizeToskLightSurface(bootstrap, overview); this.showId = typeof record(record(bootstrap).active_show).id === "string" ? String(record(record(bootstrap).active_show).id) : null; this.activePage = Number(record(overview).active_page) || 1;
      this.emit("snapshot", snapshot); this.emit("connection", true);
    } catch (error) { this.emit("warning", error instanceof Error ? error : new Error(String(error))); this.emit("connection", false); this.token = null; }
    finally { if (!this.stopping) this.timer = setTimeout(() => void this.poll(), this.intervalMilliseconds); }
  }
  public async sendExecutor(number: number, value: number, phase: "press" | "release" | "click" | "level"): Promise<boolean> {
    if (!this.token || !this.deskId || !this.showId || !Number.isInteger(number) || number < 1 || number > 42) return false;
    const headers = { authorization: `Bearer ${this.token}`, "x-tosk-show": this.showId, "x-tosk-desk": this.deskId };
    try {
      if (phase === "level") await this.request(`/api/v2/playbacks/pages/${this.activePage}/${number}/master`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ value }) });
      else {
        const send = (edge: "press" | "release") => this.request("/api/v2/playback-actions", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(toskLightExecutorAction(this.activePage, number, edge)),
        });
        if (phase === "click") { await send("press"); await send("release"); }
        else await send(phase);
      }
      return true;
    } catch (error) { this.emit("warning", error instanceof Error ? error : new Error(String(error))); return false; }
  }
  public stop(): void { this.stopping = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
