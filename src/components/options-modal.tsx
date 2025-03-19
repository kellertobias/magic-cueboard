import React, { useCallback, useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import clsx from "clsx";
import { btnBaseClasses } from "./button";
import { WSMessage } from "./executor-grid";

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

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "show-setup":
        console.log(message.data);
        setReloading(false);
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

  // Request current brightness values when modal opens
  useEffect(() => {
    if (isOpen) {
      sendMessage({ type: "get-brightness" });
    }
  }, [isOpen, sendMessage]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl w-[600px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex gap-8">
          {/* Left side - Info and Reload */}
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                Device IP
              </h3>
              <p className="text-white">
                {process.env.NEXT_PUBLIC_WS_URL || "localhost:3001"}
              </p>
            </div>

            <div>
              <button
                className={clsx(
                  btnBaseClasses,
                  "border-gray-600 text-gray-300"
                )}
                onClick={() => {
                  setReloading(true);
                  sendMessage({ type: "reload-executors" });
                }}
              >
                {reloading ? "Reloading..." : "Reload from MagicQ"}
              </button>
            </div>
          </div>

          {/* Right side - Brightness Controls */}
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Button Brightness
            </h3>
            <div className="space-y-2">
              <div>
                <label className="text-sm text-gray-300">Inactive</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={inactivePercentage}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setInactivePercentage(value);
                    handleBrightnessChange(value, activePercentage);
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-xs text-gray-400">
                  {inactivePercentage}%
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-300">Active</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activePercentage}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setActivePercentage(value);
                    handleBrightnessChange(inactivePercentage, value);
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-xs text-gray-400">{activePercentage}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
