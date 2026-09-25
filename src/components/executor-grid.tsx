"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { btnBaseClasses } from "./button";

export interface Executor {
  number: number;
  name: string;
  type: "toggle" | "flash" | "solo" | "fader" | "other";
  color: string | null;
  defaultColor?: boolean;
  dotColor: string | null;
  mode?: "CS" | "SO" | "FL" | "FD";
  region?: number;
}

export type WSMessage =
  | {
      type: "show-setup";
      data: {
        executors?: Record<number, Executor>;
        showName?: string;
        ip?: string;
      };
    }
  | {
      type: "val";
      data: {
        number: number;
        value: number;
      };
    }
  | { type: "brightness-values"; data: { inactive: number; active: number } }
  | { type: "layout-values"; data: { mode: "legacy" | "new" } }
  | { type: "source-values"; data: { source: "auto" | "self" | "windows" | "tosklight"; activeSource: "idle" | "magicq" | "tosklight" } }
  | {
      type: "hardware-connection";
      data: {
        status: "connecting" | "connected";
        transport: "local" | "remote" | null;
        detail: string;
      };
    }
  | {
      type: "system-command-response";
      data: { command: string; output: string; isError: boolean };
    };

const darkenColor = (color: string, amount: number) => {
  // Handle both 3 and 6 digit hex codes
  const fullColor =
    color.length === 3
      ? color
          .split("")
          .map((c) => c + c)
          .join("")
      : color;

  return fullColor.replace(/(.{2})/g, (hex) => {
    const value = Math.floor(Number.parseInt(hex, 16) * amount);
    return value.toString(16).padStart(2, "0");
  });
};

function displayName(executor?: Executor): string {
  return (executor?.name || "")
    .split(" · ")
    .filter((part) => !["CS", "SO", "FL", "FD"].includes(part.trim().toUpperCase()))
    .join(" · ");
}

function ExecutorButton({
  execNumber,
  executor,
  value,
  sendMessage,
}: {
  execNumber: number;
  executor: Executor;
  value: number;
  sendMessage: (message: unknown) => void;
}) {
  const isActive = value > 0;
  const name = displayName(executor);

  const bgActive = executor?.color
    ? `#${darkenColor(executor.color, 0.5)}`
    : "#333333";

  const bgDefault = executor?.color
    ? `#${darkenColor(executor.color, 0.2)}`
    : executor
    ? "#111111"
    : "#000000";
  const borderActive = executor?.color ? `#${executor.color}` : "#888888";

  const borderDefault = executor?.color
    ? `#${darkenColor(executor.color, 0.8)}`
    : executor
    ? "#383838"
    : "#111111";

  return (
    <button
      type="button"
      className={clsx(btnBaseClasses, "pt-4")}
      style={{
        backgroundColor: isActive ? bgActive : bgDefault,
        borderColor: isActive ? borderActive : borderDefault,
      }}
      disabled={!name}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        if (executor?.type === "flash") sendMessage({ type: "exec", address: execNumber, value: 1, phase: "press" });
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        sendMessage({ type: "exec", address: execNumber, value: executor?.type === "flash" ? 0 : 1, phase: executor?.type === "flash" ? "release" : "click" });
      }}
    >
      <div className="text-[0.6rem] text-gray-500 absolute top-0 left-1">
        {execNumber}
      </div>
      <div className="text-[0.6rem] text-gray-400 absolute top-0 right-1">
        {executor?.mode || (executor?.type === "fader" ? "FD" : "CS")}
      </div>
      <div
        className={clsx(
          "text-[0.6rem] absolute top-1 left-1 right-1 bottom-1 flex items-center justify-center",
          { "text-white": name },
          { "text-gray-800": !name }
        )}
        style={{ lineHeight: 1.1 }}
      >
        {name || "<Empty>"}
      </div>
      {executor?.dotColor && (
        <div
          className="h-1 rounded-full absolute bottom-1 right-6 left-6"
          style={{ backgroundColor: `#${executor.dotColor}` }}
        />
      )}
    </button>
  );
}

function ExecutorPoti({
  execNumber,
  executor,
  value,
}: {
  execNumber: number;
  executor: Executor;
  value: number;
}) {
  const name = displayName(executor);
  return (
    <div className={clsx("h-full relative flex flex-row gap-4 items-center")}>
      <div
        className={clsx("text-[0.6rem] font-semibold", {
          "text-white": name,
          "text-gray-500": !name,
        })}
      >
        {name || `<Executor ${execNumber}>`}
      </div>
      {/* Circular progress indicator with bottom opening */}
      <div className="relative w-8 h-8">
        {/* Background circle (gray stroke, open at bottom) */}
        <svg
          className="absolute inset-0"
          viewBox="0 0 36 36"
          aria-label="Poti"
          role="img"
        >
          <path
            d="M18 2
              a 16 16 0 0 1 0 32
              a 16 16 0 0 1 0 -32"
            fill="none"
            stroke="#666666"
            strokeWidth="4"
            strokeDasharray="75 25" // Creates 75° gap at bottom (360° * 25/100 = 90°)
            strokeLinecap="round"
            transform="rotate(-135 18 18)" // Rotated to center gap at bottom
          />
          {/* Progress arc that fills based on value */}
          <path
            d="M18 2
              a 16 16 0 0 1 0 32
              a 16 16 0 0 1 0 -32"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeDasharray={`${value * 75} 100`} // Scales fill with value, adjusted for 75° gap
            strokeLinecap="round"
            transform="rotate(-135 18 18)" // Matches background rotation
          />
        </svg>
      </div>
    </div>
  );
}

export function ExecutorGrid({ openSettings }: { openSettings: () => void }) {
  const [active, setActive] = useState<Record<number, number>>({});
  const [executors, setExecutors] = useState<Record<number, Executor>>([]);
  const [showName, setShowName] = useState("<Unknown Show>");
  const [activeSource, setActiveSource] = useState<"idle" | "magicq" | "tosklight">("idle");
  const [hardware, setHardware] = useState<{
    status: "connecting" | "connected";
    transport: "local" | "remote" | null;
    detail: string;
  }>({ status: "connecting", transport: null, detail: "Looking for Cueboard hardware…" });

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "show-setup":
        setShowName(message.data.showName || "<Unknown Show>");
        setExecutors(message.data.executors || []);
        break;
      case "val":
        setActive((prev) => ({
          ...prev,
          [message.data.number]: message.data.value,
        }));
        break;
      case "hardware-connection":
        setHardware(message.data);
        break;
      case "source-values":
        setActiveSource(message.data.activeSource);
        break;
    }
  }, []);

  const { sendMessage } = useWebSocket(handleMessage, []);

  return (
    <div className="flex flex-col gap-4 h-full px-4 py-6">
      <div className="flex flex-row justify-between items-center h-[40px]">
        <div className="flex flex-row gap-4 items-center justify-start">
          <button
            type="button"
            className={clsx(btnBaseClasses, "border-gray-600 text-gray-300")}
            onClick={() => {
              openSettings();
            }}
          >
            Open Settings
          </button>
          <span className="text-gray-300 font-mono text-sm">
            Current Show: {showName}
          </span>
          <span className="rounded-full border border-gray-700 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-gray-400" title={hardware.detail}>
            {hardware.status === "connecting" ? "Cueboard reconnecting" : hardware.transport === "local" ? "Pi Cueboard" : "Windows Cueboard"}
          </span>
          <span className={clsx("rounded-full border px-2 py-1 text-[0.65rem] uppercase tracking-wide", activeSource === "tosklight" ? "border-teal-700 text-teal-300" : activeSource === "magicq" ? "border-blue-700 text-blue-300" : "border-amber-800 text-amber-300")}>
            {activeSource === "tosklight" ? "ToskLight mode" : activeSource === "magicq" ? "MagicQ mode" : "Waiting for application"}
          </span>
        </div>
        <div className="flex flex-row gap-4 items-center justify-end h-full pr-4">
          <ExecutorPoti
            execNumber={41}
            executor={executors[41]}
            value={active[41] || 0}
          />
          <ExecutorPoti
            execNumber={42}
            executor={executors[42]}
            value={active[42] || 0}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 grid-rows-1 grow gap-6">
        {[0, 5].map((offset) => (
          <div
            key={`column-${offset}`}
            className="grid grid-cols-5 grid-rows-4 gap-2 w-full h-full"
          >
            {Array.from({ length: 20 }, (_, i) => {
              const execNumber = i + offset + Math.floor(i / 5) * 5 + 1;
              const value = active[execNumber] || 0;
              const executor = executors[execNumber];

              return (
                <ExecutorButton
                  key={`executor-${execNumber}`}
                  execNumber={execNumber}
                  executor={executor}
                  value={value}
                  sendMessage={sendMessage}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
