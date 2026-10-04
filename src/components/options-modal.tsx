import type React from "react";
import { useCallback, useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import clsx from "clsx";
import { btnBaseClasses } from "@/components/button";
import type { WSMessage } from "@/components/executor-grid";
import { BrightnessModal } from "@/components/brightness-modal";
import { TerminalModal } from "@/components/terminal-modal";
import { SPLMeter } from "@/components/spl-meter";
import { ConnectionStatus } from "@/components/status";
import { DateTimeSettings } from "@/components/date-time-settings";

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Default brightness values (in percentage)
const DEFAULT_INACTIVE_BRIGHTNESS = 10;
const DEFAULT_ACTIVE_BRIGHTNESS = 20;
const sourceChoices = [
  { value: "auto", label: "Automatic" },
  { value: "windows", label: "MagicQ Remote API" },
  { value: "tosklight", label: "ToskLight API" },
  { value: "self", label: "Local MagicQ compatibility" },
] as const;

const valueMap: Record<string, string> = {};
for (let i = 0; i < 32; i++) {
  valueMap[i] = `${Math.ceil(i / 2)}`;
}
for (let i = 32; i < 64; i++) {
  valueMap[i] = `${i - 16}`;
}
for (let i = 64; i < 100; i++) {
  valueMap[i] = `${Math.ceil((i - 64) * 5.5 + 48)}`;
}
valueMap[100] = `${255}`;

/**
 * Converts a percentage (0-100) to a brightness value (0-255) using exponential scaling
 */
function percentageToBrightness(percentage: number): number {
  return Number(valueMap[percentage]);
}

/**
 * Converts a brightness value (0-255) to a percentage (0-100) using inverse exponential scaling
 */
function brightnessToPercentage(brightness: number): number {
  // find the value in the valueMap that is closest to the brightness
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const closest = Object.keys(valueMap).reduce((prev: any, curr: any) => {
    return Math.abs(Number(valueMap[curr]) - brightness) <
      Math.abs(Number(valueMap[prev]) - brightness)
      ? curr
      : prev;
  }, 0);
  return Number(closest);
}

export function OptionsModal({ isOpen, onClose }: OptionsModalProps) {
  const [reloading, setReloading] = useState(false);
  const [inactivePercentage, setInactivePercentage] = useState(
    DEFAULT_INACTIVE_BRIGHTNESS
  );
  const [activePercentage, setActivePercentage] = useState(
    DEFAULT_ACTIVE_BRIGHTNESS
  );
  const [showName, setShowName] = useState("<Unknown Show>");
  const [commandOutput, setCommandOutput] = useState<{
    command: string;
    output: (string | React.ReactNode)[];
    hasError: boolean;
  } | null>(null);
  const [isBrightnessModalOpen, setIsBrightnessModalOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"spl" | "controls" | "system" | "time">("controls");
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<"legacy" | "new">("legacy");
  const [surfaceSource, setSurfaceSource] = useState<"auto" | "self" | "windows" | "tosklight">("auto");

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "show-setup":
        console.log(message.data);
        setReloading(false);
        if (message.data?.showName) {
          setShowName(message.data.showName);
        }
        if (message.data?.ip) {
          setIpAddress(message.data.ip);
        }
        break;
      case "brightness-values":
        // Update local state when receiving brightness values from server
        if (message.data?.inactive !== undefined) {
          setInactivePercentage(brightnessToPercentage(message.data.inactive));
        }
        if (message.data?.active !== undefined) {
          setActivePercentage(brightnessToPercentage(message.data.active));
        }
        break;
      case "layout-values":
        setLayoutMode(message.data.mode);
        break;
      case "source-values":
        setSurfaceSource(message.data.source);
        break;
      case "system-command-response":
        setCommandOutput((prev) => ({
          command: message.data.command,
          output: [
            ...(prev?.output || []),
            message.data.isError ? (
              <span className="text-red-500" key={message.data.output}>
                {message.data.output}
              </span>
            ) : (
              message.data.output
            ),
          ],
          hasError: prev?.hasError || message.data.isError || false,
        }));
        break;
      case "system-command-complete":
        setIsExecuting(false);
        // Only a zero-exit software update receives this success path. Delay
        // briefly so the terminal can render its final confirmation first.
        if (message.data?.command === "update-software" && message.data?.succeeded) {
          window.setTimeout(() => window.location.reload(), 1000);
        }
        break;
    }
  }, []);

  const { sendMessage } = useWebSocket(handleMessage, []);

  // Handler for brightness changes
  const handleBrightnessChange = useCallback(
    (inactive: number, active: number) => {
      sendMessage({
        type: "set-brightness",
        data: {
          inactive: percentageToBrightness(inactive),
          active: percentageToBrightness(active),
        },
      });
    },
    [sendMessage]
  );

  // Handler for system commands
  const handleSystemCommand = (command: string) => {
    setPendingCommand(command);
    setIsTerminalModalOpen(true);
  };

  const handleCommandConfirm = () => {
    if (pendingCommand) {
      setIsExecuting(true);
      setCommandOutput(null);
      sendMessage({ type: "system-command", command: pendingCommand });
    }
  };

  // Request current brightness values when modal opens
  useEffect(() => {
    if (isOpen) {
      sendMessage({ type: "get-brightness" });
      sendMessage({ type: "get-layout" });
      sendMessage({ type: "get-source" });
    }
  }, [isOpen, sendMessage]);

  useEffect(() => {
    if (!isOpen) {
      setIsBrightnessModalOpen(false);
      setIsTerminalModalOpen(false);
      setSettingsPage("controls");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="cueboard-settings" role="dialog" aria-modal="true" aria-label="Settings">
        <aside className="cueboard-settings-sidebar">
          <ConnectionStatus deviceInfo={<><div><span>Device IP</span><strong>{ipAddress || "Waiting for device…"}</strong></div><div><span>Current show</span><strong title={showName}>{showName}</strong></div></>} actions={<button type="button" onClick={onClose} className="cueboard-home-button">← Back home</button>} />
          <div className="cueboard-settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
            {([['controls', 'Controls', 'Source and executor layout'], ['spl', 'SPL limits', 'Thresholds and averaging'], ['time', 'Date and time', 'Device clock'], ['system', 'System', 'Brightness, updates and restart']] as const).map(([page, label, detail]) => (
              <button key={page} id={`settings-tab-${page}`} type="button" role="tab" aria-controls={`settings-panel-${page}`} aria-selected={settingsPage === page} tabIndex={settingsPage === page ? 0 : -1}
                onKeyDown={event => {
                  const pages = ['controls', 'spl', 'time', 'system'] as const;
                  const index = pages.indexOf(page);
                  const next = event.key === 'ArrowDown' ? (index + 1) % 4 : event.key === 'ArrowUp' ? (index + 3) % 4 : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : null;
                  if (next === null) return;
                  event.preventDefault(); setSettingsPage(pages[next]); setIsBrightnessModalOpen(false); document.getElementById(`settings-tab-${pages[next]}`)?.focus();
                }}
                onClick={() => { setSettingsPage(page); setIsBrightnessModalOpen(false); }} className="cueboard-settings-tab">
                <span>{label}</span><span>{detail}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="cueboard-settings-content" role="tabpanel" id={`settings-panel-${settingsPage}`} aria-labelledby={`settings-tab-${settingsPage}`}>
          {settingsPage !== "spl" && <header className="cueboard-page-heading"><span>Settings</span><h2>{settingsPage === 'time' ? 'Date and time' : settingsPage === 'controls' ? 'Controls' : 'System'}</h2></header>}
          <div className="cueboard-settings-body">
            {settingsPage === "time" && <DateTimeSettings />}
            {settingsPage === "spl" && <SPLMeter settingsOnly />}
            <div className={settingsPage === "controls" ? "block" : "hidden"}>
              <div className="cueboard-source-tabs" role="tablist" aria-label="Show data source">
                {sourceChoices.map((choice, index) => <button key={choice.value} id={`source-tab-${choice.value}`} type="button" role="tab" aria-selected={surfaceSource === choice.value} aria-controls="source-controls-panel" tabIndex={surfaceSource === choice.value ? 0 : -1}
                  onClick={() => { sendMessage({ type: "set-source", data: { source: choice.value } }); setSurfaceSource(choice.value); }}
                  onKeyDown={event => {
                    const next = event.key === "ArrowRight" ? (index + 1) % 4 : event.key === "ArrowLeft" ? (index + 3) % 4 : event.key === "Home" ? 0 : event.key === "End" ? 3 : null;
                    if (next === null) return;
                    event.preventDefault();
                    document.getElementById(`source-tab-${sourceChoices[next].value}`)?.focus();
                  }}>
                  {choice.label}
                </button>)}
              </div>
              <div id="source-controls-panel" role="tabpanel" aria-labelledby={`source-tab-${surfaceSource}`} className="grid grid-cols-2 gap-6 pt-5">
                <section>
                  <h3 className="cueboard-section-label mb-2">Executor layout</h3>
                  <div className="grid grid-cols-2 gap-2" aria-label="Executor layout mode">
                    {(["legacy", "new"] as const).map(mode => <button key={mode} type="button" aria-pressed={layoutMode === mode}
                      className={clsx(btnBaseClasses, "text-xs", layoutMode === mode ? "border-blue-400 text-white bg-slate-800" : "border-gray-700 text-gray-400")}
                      onClick={() => sendMessage({ type: "set-layout", data: { mode } })}>{mode === "legacy" ? "Legacy" : "New"}</button>)}
                  </div>
                </section>
                {surfaceSource !== "tosklight" && <section>
                  <h3 className="cueboard-section-label mb-2">MagicQ show data</h3>
                  <button type="button" className={clsx(btnBaseClasses, "border-gray-600 text-gray-300 w-full")} disabled={reloading}
                    onClick={() => { setReloading(true); sendMessage({ type: "reload-executors" }); }}>
                    {reloading ? "Reloading..." : "Reload from MagicQ"}
                  </button>
                </section>}
              </div>
            </div>

            {/* Right column - System Controls */}
            <div className={settingsPage === "system" ? "block" : "hidden"}>
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                System Controls
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className={clsx(btnBaseClasses, "border-gray-600 text-gray-300 w-full")} onClick={() => setIsBrightnessModalOpen(true)}>Button Brightness</button>
                <button
                  type="button"
                  className={clsx(
                    btnBaseClasses,
                    "border-gray-600 text-gray-300 w-full"
                  )}
                  onClick={() => handleSystemCommand("update-software")}
                >
                  Update Software
                </button>

                <button
                  type="button"
                  className={clsx(
                    btnBaseClasses,
                    "border-gray-600 text-gray-300 w-full"
                  )}
                  onClick={() => handleSystemCommand("restart-server")}
                >
                  Restart Server
                </button>

                <button
                  type="button"
                  className={clsx(
                    btnBaseClasses,
                    "border-red-600 text-red-300 w-full"
                  )}
                  onClick={() => handleSystemCommand("restart-device")}
                >
                  Reboot
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <TerminalModal
        isOpen={isTerminalModalOpen}
        onClose={() => {
          setIsTerminalModalOpen(false);
          setPendingCommand(null);
          setCommandOutput(null);
          setIsExecuting(false);
        }}
        command={pendingCommand || ""}
        onConfirm={handleCommandConfirm}
        output={commandOutput?.output || []}
        isExecuting={isExecuting}
        hasError={commandOutput?.hasError || false}
      />

      <BrightnessModal
        isOpen={isBrightnessModalOpen}
        onClose={() => setIsBrightnessModalOpen(false)}
        inactivePercentage={inactivePercentage}
        activePercentage={activePercentage}
        onBrightnessChange={handleBrightnessChange}
      />
    </>
  );
}
