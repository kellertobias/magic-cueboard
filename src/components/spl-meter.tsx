"use client";

import { useState, useCallback, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { SPLBar, SPLGraph } from "./spl-graph";
import { defaultSPLSettings, type SPLColor, type SPLSettings } from "@/lib/spl-settings";

const range = [55, 110];
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

  const handleMessage = useCallback((message: { type: string; data: any }) => {
    if (message.type === "spl") setMeasurements(previous => [...previous.slice(-399), message.data.measured]);
    if (message.type === "spl-state") setState(message.data);
    if (message.type === "spl-settings") { setSettings(message.data); setDraft(message.data); setError(""); }
    if (message.type === "spl-settings-error") setError(message.data.message);
  }, []);
  const { sendMessage } = useWebSocket(handleMessage, []);
  useEffect(() => { sendMessage({ type: "get-spl-settings" }); }, [sendMessage]);

  const numberField = (label: string, value: number, set: (value: number) => void, step = 1) => (
    <label className="flex flex-col gap-1 text-sm text-gray-300" key={label}>
      {label}
      <input className="rounded border border-gray-600 bg-gray-900 p-2 text-white" type="number" min="0" max="200" step={step}
        value={value} onChange={event => set(Number(event.target.value))} />
    </label>
  );
  const thresholds = (name: "average" | "peak") => (
    <fieldset className="grid grid-cols-3 gap-3">
      <legend className="mb-2 font-semibold capitalize">{name} thresholds · dB</legend>
      {(["green", "yellow", "red"] as const).map(color => numberField(
        `${color === "green" ? "Green begins" : color === "yellow" ? "Yellow begins" : "Red begins"}`,
        draft[name][color], value => setDraft(previous => ({ ...previous, [name]: { ...previous[name], [color]: value } }))
      ))}
    </fieldset>
  );

  return <>
    <button type="button" className="w-full p-6 pt-0 text-white text-left focus-visible:outline focus-visible:outline-blue-400" onClick={() => { setDraft(settings); setOpen(true); }} aria-label="Open SPL settings">
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
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="SPL settings">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-6 text-white shadow-2xl space-y-5">
        <h2 className="text-xl font-bold">SPL settings</h2>
        <p className="text-sm text-gray-400">Below green is blue. The loudest color from average and peak wins. Red blinks after the selected time.</p>
        {thresholds("average")}{thresholds("peak")}
        <div className="grid grid-cols-3 gap-3">
          {numberField("Average window · seconds", draft.averageSeconds, value => setDraft(previous => ({ ...previous, averageSeconds: value })), 0.1)}
          {numberField("Peak window · seconds", draft.peakSeconds, value => setDraft(previous => ({ ...previous, peakSeconds: value })), 0.1)}
          {numberField("Red blink after · seconds", draft.redBlinkSeconds, value => setDraft(previous => ({ ...previous, redBlinkSeconds: value })), 0.1)}
        </div>
        <label className="flex flex-col gap-1 text-sm text-gray-300">DJ message MQTT topic
          <input className="rounded border border-gray-600 bg-gray-900 p-2 text-white" value={draft.messageTopic} onChange={event => setDraft(previous => ({ ...previous, messageTopic: event.target.value }))} />
        </label>
        <fieldset className="grid grid-cols-2 gap-3"><legend className="mb-2 font-semibold">Message buttons</legend>
          {draft.messages.map((message, index) => <label key={index} className="flex flex-col gap-1 text-sm text-gray-300">Message {index + 1}
            <input className="rounded border border-gray-600 bg-gray-900 p-2 text-white" maxLength={160} value={message}
              onChange={event => setDraft(previous => ({ ...previous, messages: previous.messages.map((item, i) => i === index ? event.target.value : item) }))} />
          </label>)}
        </fieldset>
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <div className="flex justify-end gap-3">
          <button className="rounded border border-gray-600 px-4 py-2" onClick={() => setOpen(false)}>Back</button>
          <button className="rounded bg-blue-600 px-4 py-2 font-semibold" onClick={() => {
            if (!(draft.average.green < draft.average.yellow && draft.average.yellow < draft.average.red && draft.peak.green < draft.peak.yellow && draft.peak.yellow < draft.peak.red)) { setError("Thresholds must increase from green to red."); return; }
            setError(""); sendMessage({ type: "set-spl-settings", data: draft });
          }}>Save</button>
        </div>
      </div>
    </div>}
  </>;
}
