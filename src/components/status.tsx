"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useEffect, useRef, useState } from "react";
import { systemMetricsAreFresh } from "@/lib/system-metrics";

interface SystemMetrics {
  timestamp: number;
  cpuP95Percent: number | null;
  ramUsedBytes: number;
  ramTotalBytes: number;
  gpuPercent: number | null;
  temperatureC: number | null;
  cpuHistory: number[];
  ageMilliseconds?: number;
}

const percent = (value: number | null) => value === null ? "—" : `${Math.round(value)}%`;
const gib = (bytes: number) => (bytes / 1073741824).toFixed(1);

export function ConnectionStatus() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [now, setNow] = useState(0);
  const receivedAt = useRef<number | null>(null);
  const [windowsConnected, setWindowsConnected] = useState<boolean | null>(null);
  const { status, disconnectedSince, sendMessage } = useWebSocket((message) => {
    if (message.type === "system-metrics") { receivedAt.current = performance.now(); setNow(performance.now()); setMetrics(message.data ?? null); }
    if (message.type === "system-connection") setWindowsConnected(Boolean(message.data?.connected));
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status === "connected") sendMessage({ type: "get-system-metrics" });
    else { setMetrics(null); receivedAt.current = null; setWindowsConnected(null); }
  }, [status, sendMessage]);

  const current = status === "connected" && metrics && systemMetricsAreFresh(receivedAt.current, now, metrics.ageMilliseconds) ? metrics : null;
  const history = current?.cpuHistory?.slice(-60) ?? [];
  const points = history.map((value, index) => `${history.length === 1 ? 0 : index * 72 / (history.length - 1)},${16 - Math.max(0, Math.min(100, value)) * 0.15}`).join(" ");
  const disconnectedSeconds = disconnectedSince ? Math.floor((Date.now() - disconnectedSince) / 1000) : 0;

  return (
    <div className="w-full px-3 text-white">
      <div className="flex items-center justify-between h-5">
        <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Windows system</span>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
          <span className={`w-2 h-2 rounded-full ${current ? "bg-green-500 shadow-[0_0_5px_#22c55e]" : "bg-red-500"}`} />
          {status !== "connected" ? `Pi disconnected${disconnectedSeconds >= 3 ? ` (${disconnectedSeconds}s)` : ""}` : current ? "Connected" : windowsConnected === false ? "Windows reconnecting" : "Waiting for Windows data"}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 mt-0.5">
        <Metric label="CPU P95 · 5s" value={percent(current?.cpuP95Percent ?? null)}>
          <svg width="72" height="16" viewBox="0 0 72 16" aria-hidden="true" className="mt-0.5">
            {points && <polyline points={points} fill="none" stroke="#22c55e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          </svg>
        </Metric>
        <Metric label="RAM · GiB" value={current ? gib(current.ramUsedBytes) : "—"} detail={current ? ` / ${gib(current.ramTotalBytes)}` : undefined} />
        <Metric label="GPU" value={percent(current?.gpuPercent ?? null)} />
        <Metric label="Temp" value={current?.temperatureC == null ? "—" : `${Math.round(current.temperatureC)}°C`} />
      </div>
    </div>
  );
}

function Metric({ label, value, detail, children }: { label: string; value: string; detail?: string; children?: React.ReactNode }) {
  return <div className="min-w-0 border-l border-gray-800 pl-2">
    <div className="text-[10px] leading-3 text-gray-400 whitespace-nowrap">{label}</div>
    <div className="text-base font-semibold leading-5 whitespace-nowrap">{value}<span className="text-[10px] font-normal text-gray-400">{detail}</span></div>
    {children}
  </div>;
}
