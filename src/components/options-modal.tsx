import React, { useCallback, useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import clsx from "clsx";
import { btnBaseClasses } from "./button";
import { WSMessage } from "./executor-grid";
import { BrightnessModal } from "./brightness-modal";
import { TerminalModal } from "./terminal-modal";

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Default brightness values (in percentage)
const DEFAULT_INACTIVE_BRIGHTNESS = 10;
const DEFAULT_ACTIVE_BRIGHTNESS = 20;

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
  const closest = Object.keys(valueMap).reduce((prev: any, curr: any) => {
    return Math.abs(Number(curr) - brightness) <
      Math.abs(Number(prev) - brightness)
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
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [ipAddress, setIpAddress] = useState<string | null>(null);

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
      case "system-command-response":
        setCommandOutput((prev) => ({
          command: message.data.command,
          output: [
            ...(prev?.output || []),
            message.data.isError ? (
              <span className="text-red-500">{message.data.output}</span>
            ) : (
              message.data.output
            ),
          ],
          hasError: prev?.hasError || message.data.isError || false,
        }));
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
    }
  }, [isOpen, sendMessage]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-6 rounded-lg shadow-xl w-[600px] max-h-[280px] overflow-y-scroll">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Settings</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white -m-4 p-4"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-4">
            {/* Left column - Device Info */}
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                Device Information
              </h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-1">
                    Device IP
                  </h4>
                  <p className="text-white">{ipAddress}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-1">
                    Current Show
                  </h4>
                  <p className="text-white font-mono text-sm">{showName}</p>
                </div>
              </div>
            </div>

            {/* Middle column - MagicQ Controls */}
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                MagicQ Controls
              </h3>
              <div className="space-y-2">
                <button
                  className={clsx(
                    btnBaseClasses,
                    "border-gray-600 text-gray-300 w-full"
                  )}
                  onClick={() => {
                    setReloading(true);
                    sendMessage({ type: "reload-executors" });
                  }}
                >
                  {reloading ? "Reloading..." : "Reload from MagicQ"}
                </button>

                <button
                  className={clsx(
                    btnBaseClasses,
                    "border-gray-600 text-gray-300 w-full"
                  )}
                  onClick={() => setIsBrightnessModalOpen(true)}
                >
                  Button Brightness
                </button>
              </div>
            </div>

            {/* Right column - System Controls */}
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                System Controls
              </h3>
              <div className="space-y-2">
                <button
                  className={clsx(
                    btnBaseClasses,
                    "border-gray-600 text-gray-300 w-full"
                  )}
                  onClick={() => handleSystemCommand("update-software")}
                >
                  Update Software
                </button>

                <button
                  className={clsx(
                    btnBaseClasses,
                    "border-gray-600 text-gray-300 w-full"
                  )}
                  onClick={() => handleSystemCommand("restart-server")}
                >
                  Restart Server
                </button>

                <button
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
        </div>
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
