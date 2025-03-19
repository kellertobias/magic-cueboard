import React, { useCallback, useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import clsx from "clsx";
import { btnBaseClasses } from "./button";
import { WSMessage } from "./executor-grid";

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Default brightness values
const DEFAULT_INACTIVE_BRIGHTNESS = 25;
const DEFAULT_ACTIVE_BRIGHTNESS = 40;

export function OptionsModal({ isOpen, onClose }: OptionsModalProps) {
  const [reloading, setReloading] = useState(false);
  const [inactiveBrightness, setInactiveBrightness] = useState(
    DEFAULT_INACTIVE_BRIGHTNESS
  );
  const [activeBrightness, setActiveBrightness] = useState(
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
          setInactiveBrightness(message.data.inactive);
        }
        if (message.data?.active !== undefined) {
          setActiveBrightness(message.data.active);
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
        data: { inactive, active },
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
                  max="255"
                  value={inactiveBrightness}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setInactiveBrightness(value);
                    handleBrightnessChange(value, activeBrightness);
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-xs text-gray-400">
                  {inactiveBrightness}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-300">Active</label>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={activeBrightness}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setActiveBrightness(value);
                    handleBrightnessChange(inactiveBrightness, value);
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-xs text-gray-400">{activeBrightness}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
