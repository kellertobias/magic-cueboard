"use client";

import { useState, useCallback, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { SPLBar, SPLGraph } from "./spl-graph";
import { defaultSPLSettings, splColor, type SPLColor, type SPLSettings } from "@/lib/spl-settings";

const range = [50, 110];
const colorClass: Record<SPLColor, string> = {
  blue: "text-blue-400", green: "text-green-500", yellow: "text-yellow-400",
  red: "text-red-500", "red-blink": "text-red-500 animate-pulse",
};

export function SPLMeter() {
  const [measurements, setMeasurements] = useState<number[]>([]);
  const [state, setState] = useState<{ average: number; peak: number; color: SPLColor; freqMode: string } | null>(null);
  const [settings, setSettings] = useState<SPLSettings>(defaultSPLSettings);
  const [draft, setDraft] = useState<SPLSettings>(defaultSPLSettings);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const handleMessage = useCallback((message: { type: string; data: any }) => {
    if (message.type === "spl") setMeasurements(previous => [...previous.slice(-399), message.data.measured]);
    if (message.type === "spl-state") setState(message.data);
    if (message.type === "spl-settings") { setSettings(message.data); setDraft(message.data); setError(""); }
    if (message.type === "spl-settings-saved") { setSaving(false); setSaved(true); }
    if (message.type === "spl-settings-error") { setError(message.data.message); setSaving(false); }
  }, []);
  const { status, sendMessage } = useWebSocket(handleMessage, []);
  useEffect(() => { sendMessage({ type: "get-spl-settings" }); }, [sendMessage]);

  const axisMin = 50;
  const axisMax = 110;
  const thresholdRail = (name: "average" | "peak") => (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold capitalize">{name} thresholds · dB</legend>
      <div className="flex justify-between text-xs">
        {(["green", "yellow", "red"] as const).map(color => <span key={color} style={{ color }}>{color} {draft[name][color]}</span>)}
      </div>
      <div className="relative h-12">
        <div className="absolute inset-x-0 top-6 h-1 rounded" style={{ background: `linear-gradient(to right, #60a5fa 0%, #60a5fa ${(draft[name].green-axisMin)/(axisMax-axisMin)*100}%, #22c55e ${(draft[name].green-axisMin)/(axisMax-axisMin)*100}%, #22c55e ${(draft[name].yellow-axisMin)/(axisMax-axisMin)*100}%, #facc15 ${(draft[name].yellow-axisMin)/(axisMax-axisMin)*100}%, #facc15 ${(draft[name].red-axisMin)/(axisMax-axisMin)*100}%, #ef4444 ${(draft[name].red-axisMin)/(axisMax-axisMin)*100}%)` }} />
        {(["green", "yellow", "red"] as const).map(color => <input key={color} aria-label={`${name} ${color} threshold`} disabled={saving} type="range" min={axisMin} max={axisMax} step={1} value={draft[name][color]}
          className="threshold-handle absolute inset-0 h-12 w-full" style={{ color: color === "green" ? "#22c55e" : color === "yellow" ? "#facc15" : "#ef4444" }}
          onChange={event => setDraft(previous => {
            const limits = previous[name];
            const value = Math.max(color === "green" ? axisMin : color === "yellow" ? limits.green + 1 : limits.yellow + 1,
              Math.min(Number(event.target.value), color === "red" ? axisMax : color === "yellow" ? limits.red - 1 : limits.yellow - 1));
            return { ...previous, [name]: { ...limits, [color]: value } };
          })} />)}
      </div>
    </fieldset>
  );
  const durationSlider = (label: string, key: "averageSeconds" | "peakSeconds" | "redBlinkSeconds", min: number, max: number, step: number) => (
    <label className="block text-sm">{label}: <strong>{draft[key]} s</strong>
      <input aria-label={label} className="duration-handle mt-1 block h-11 w-full" disabled={saving} type="range" min={min} max={max} step={step} value={draft[key]}
        onChange={event => setDraft(previous => ({ ...previous, [key]: Number(event.target.value) }))} />
    </label>
  );

  return <>
    <button type="button" className="relative w-full p-6 pt-0 text-white text-left focus-visible:outline focus-visible:outline-blue-400" onClick={() => { setDraft(settings); setSaved(false); setOpen(true); }} aria-label="Open SPL settings">
      <svg aria-hidden="true" className="absolute right-3 top-0 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m14 5 5 5" /></svg>
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-5xl font-bold mb-2 font-mono flex flex-row items-center justify-center px-4">
            <div className={`${colorClass[state?.color ?? "blue"]} text-5xl w-40`}>
              {state ? state.average.toFixed(1) : "--.-"}
            </div>
            <div className="flex flex-col items-start justify-start pl-4 -mt-5 w-40 font-sans">
              <div><span className="text-lg mb-1">{state?.freqMode ?? "dBA"}</span>{" "}<span className="font-light text-gray-400 text-xs mb-1">(Avg / Peak)</span></div>
              <div className="h-1 w-full bg-gray-700 rounded-full"><SPLBar value={state?.peak ?? 0} minValue={range[0]} maxValue={range[1]} color={state?.color ?? "blue"} /></div>
            </div>
          </div>
        </div>
        <div className="flex justify-stretch gap-2">
          <div className="h-24 grow relative">
            <SPLGraph data={measurements} maxPoints={400} minValue={range[0]} maxValue={range[1]} thresholds={settings.average} />
            <div className="absolute top-0 bottom-0 right-0 p-1.5 flex flex-col justify-between text-xs text-gray-400"><span>{range[1]} {state?.freqMode ?? "dBA"}</span><span>{range[0]} {state?.freqMode ?? "dBA"}</span></div>
          </div>
        </div>
      </div>
    </button>
    {open && <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 p-3 text-white" role="dialog" aria-modal="true" aria-label="SPL settings">
      <header className="mb-2 flex shrink-0 items-center gap-3">
        <button type="button" className="rounded border border-gray-500 bg-gray-800 px-4 py-2 text-sm" onClick={() => setOpen(false)}>Back</button>
        <h2 className="text-lg font-bold">SPL settings</h2>
        {error && <p role="alert" className="min-w-0 flex-1 text-xs text-red-300">{error}</p>}
        {saved && !dirty && <p role="status" className="text-sm text-green-400">Saved</p>}
        <button type="button" disabled={!dirty || saving || status !== "connected"} className="ml-auto rounded bg-blue-600 px-5 py-2 text-sm font-semibold disabled:bg-gray-800 disabled:text-gray-500" onClick={() => {
          setError(""); setSaving(true); setSaved(false); sendMessage({ type: "set-spl-settings", data: draft });
        }}>{saving ? "Saving…" : "Save"}</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid h-full min-h-[230px] grid-cols-[3fr_1fr] gap-5">
          <div className="flex min-h-0 flex-col">
            {thresholdRail("average")}
            <div className="relative min-h-[70px] flex-1 border-y border-gray-700">
              <svg className="h-full w-full" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Average and peak sound levels on the threshold scale">
                {Array.from({ length: 7 }, (_, index) => <line key={index} x1={index * 1000 / 6} x2={index * 1000 / 6} y1="0" y2="100" stroke="#374151" strokeWidth="1" />)}
                {state && (["average", "peak"] as const).map((name, index) => <rect key={name} x="0" y={index * 40 + 12} height="22" rx="3"
                  width={Math.max(0, Math.min(1000, (state[name] - axisMin) / (axisMax - axisMin) * 1000))}
                  fill={{ blue: "#60a5fa", green: "#22c55e", yellow: "#facc15", red: "#ef4444" }[splColor(state[name], draft[name])]} />)}
              </svg>
              <div className="pointer-events-none absolute left-2 top-1 text-xs text-white">Average {state ? `${state.average.toFixed(1)} dB` : "—"}</div>
              <div className="pointer-events-none absolute left-2 top-[48%] text-xs text-white">Peak {state ? `${state.peak.toFixed(1)} dB` : "—"}</div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-gray-400">{Array.from({ length: 7 }, (_, index) => <span key={index}>{Math.round(axisMin + index * (axisMax - axisMin) / 6)}</span>)}</div>
            </div>
            {thresholdRail("peak")}
          </div>
          <div className="flex flex-col justify-between gap-2 border-l border-gray-700 pl-4">
            {durationSlider("Average window", "averageSeconds", 1, 120, 1)}
            {durationSlider("Peak window", "peakSeconds", 0.1, 30, 0.1)}
            {durationSlider("Red before blinking", "redBlinkSeconds", 0, 120, 1)}
          </div>
        </div>
      </div>
      <style jsx global>{`
        .threshold-handle { appearance: none; background: transparent; pointer-events: none; touch-action: none; }
        .threshold-handle::-webkit-slider-thumb { appearance: none; pointer-events: auto; width: 44px; height: 44px; border-radius: 6px; background: currentColor; border: 2px solid white; cursor: ew-resize; }
        .threshold-handle::-moz-range-thumb { pointer-events: auto; width: 44px; height: 44px; border-radius: 6px; background: currentColor; border: 2px solid white; cursor: ew-resize; }
        .duration-handle { appearance: none; background: transparent; touch-action: none; }
        .duration-handle::-webkit-slider-runnable-track { height: 6px; background: #374151; border-radius: 6px; }
        .duration-handle::-webkit-slider-thumb { appearance: none; width: 40px; height: 40px; margin-top: -17px; border-radius: 10px; background: #60a5fa; border: 2px solid white; }
        .duration-handle::-moz-range-track { height: 6px; background: #374151; }
        .duration-handle::-moz-range-thumb { width: 40px; height: 40px; border-radius: 10px; background: #60a5fa; border: 2px solid white; }
        .threshold-handle:focus-visible::-webkit-slider-thumb { outline: 3px solid #93c5fd; outline-offset: 3px; }
      `}</style>
    </div>}
  </>;
}
