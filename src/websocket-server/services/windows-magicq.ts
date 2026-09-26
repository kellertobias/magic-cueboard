import { EventEmitter } from "node:events";
import WebSocket from "ws";

export interface WindowsMagicQExecutor {
  number: number;
  name: string;
  type: "toggle" | "flash" | "solo" | "fader" | "other";
  color: string | null;
  defaultColor?: boolean;
  dotColor: string | null;
  value: number;
  active: boolean;
  mode: "CS" | "SO" | "FL" | "FD" | null;
  region?: number;
}

export interface WindowsMagicQSnapshot {
  type: "magicq-snapshot" | "surface-snapshot";
  schemaVersion: 1 | 2;
  source?: "idle" | "magicq" | "tosklight";
  connected: boolean;
  page: 1;
  showName: string | null;
  executors: Record<number, WindowsMagicQExecutor>;
  layoutMode: "legacy" | "new";
  hardware?: {
    cueboardPresent: boolean | null;
    cueboardConnected: boolean;
  };
  system?: WindowsSystemMetrics | null;
}

export interface WindowsSystemMetrics {
  timestamp: number;
  cpuP95Percent: number | null;
  ramUsedBytes: number;
  ramTotalBytes: number;
  gpuPercent: number | null;
  temperatureC: number | null;
  cpuHistory: number[];
  ageMilliseconds?: number;
}

export class WindowsMagicQService extends EventEmitter {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private retryMilliseconds = 1000;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private endpoint: string, private token: string, private timing = { heartbeat: 5000, stale: 15000, retry: 1000, maxRetry: 10000 }) {
    super();
    const url = new URL(endpoint);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new Error("WINDOWS_MAGICQ_WS_URL must use ws:// or wss://");
    }
    if (token.length < 16) throw new Error("WINDOWS_MAGICQ_TOKEN is too short");
    this.retryMilliseconds = timing.retry;
  }

  public start(): void {
    this.stopping = false;
    this.connect();
  }

  private connect(): void {
    if (this.stopping || this.socket) return;
    const url = new URL(this.endpoint);
    url.searchParams.set("token", this.token);
    const socket = new WebSocket(url, { handshakeTimeout: 5000 });
    this.socket = socket;
    let lastPong = performance.now();
    socket.on("pong", () => { lastPong = performance.now(); });
    socket.on("open", () => {
      lastPong = performance.now();
      this.heartbeat = setInterval(() => {
        if (performance.now() - lastPong > this.timing.stale) { socket.terminate(); return; }
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }, this.timing.heartbeat);
      this.retryMilliseconds = this.timing.retry;
      this.emit("connection", true);
      socket.send(JSON.stringify({ type: "snapshot-request" }));
    });
    socket.on("message", (bytes) => {
      try {
        const value = JSON.parse(bytes.toString()) as (Partial<WindowsMagicQSnapshot> & { data?: WindowsSystemMetrics }) | { type: "system-metrics"; data?: WindowsSystemMetrics };
        if (value.type === "system-metrics") { this.emit("system-metrics", value.data); return; }
        const snapshot = value as Partial<WindowsMagicQSnapshot>;
        if (!(["magicq-snapshot", "surface-snapshot"] as unknown[]).includes(snapshot.type) || !([1, 2] as unknown[]).includes(snapshot.schemaVersion) || snapshot.page !== 1 || typeof snapshot.connected !== "boolean" || !snapshot.executors || typeof snapshot.executors !== "object") return;
        this.emit("snapshot", snapshot as WindowsMagicQSnapshot);
      } catch (error) {
        this.emit("warning", error);
      }
    });
    socket.on("error", (error) => this.emit("warning", error));
    socket.on("close", () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (this.socket === socket) this.socket = null;
      this.emit("connection", false);
      if (!this.stopping) {
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, this.retryMilliseconds);
        this.retryMilliseconds = Math.min(this.timing.maxRetry, this.retryMilliseconds * 2);
      }
    });
  }

  public requestSnapshot(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "snapshot-request" }));
  }

  public setLayout(mode: "legacy" | "new"): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "set-layout", mode }));
  }

  public setBrightness(inactive: number, active: number): boolean {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !Number.isInteger(inactive) || inactive < 0 || inactive > 255 ||
      !Number.isInteger(active) || active < 0 || active > 255
    ) return false;
    this.socket.send(JSON.stringify({ type: "set-brightness", inactive, active }));
    return true;
  }

  public sendExecutor(number: number, value: number, phase: "press" | "release" | "click" | "level"): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || !Number.isInteger(number) || number < 1 || number > 42 || !Number.isFinite(value) || value < 0 || value > 1) return false;
    this.socket.send(JSON.stringify({ type: "executor-command", number, value, phase }));
    return true;
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, 1000);
      socket.once("close", () => { clearTimeout(timer); resolve(); });
      socket.close();
    });
  }
}
