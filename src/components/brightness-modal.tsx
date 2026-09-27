import React from "react";

interface BrightnessModalProps {
  isOpen: boolean;
  onClose: () => void;
  inactivePercentage: number;
  activePercentage: number;
  onBrightnessChange: (inactive: number, active: number) => void;
}

/**
 * Modal component for configuring button brightness settings
 */
export function BrightnessModal({
  isOpen,
  onClose,
  inactivePercentage,
  activePercentage,
  onBrightnessChange,
}: BrightnessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="cueboard-settings-subpage">
      <div className="w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">
            Button Brightness
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cueboard-home-button" aria-label="Back to settings"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <label
              htmlFor="inactive-brightness"
              className="text-sm text-gray-300"
            >
              Idle Brightness
            </label>
            <input
              id="inactive-brightness"
              type="range"
              min="0"
              max="100"
              value={inactivePercentage}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value);
                onBrightnessChange(value, activePercentage);
              }}
              className="w-full h-8 accent-blue-400 cursor-pointer"
            />
            <div className="text-xs text-gray-400">{inactivePercentage}%</div>
          </div>

          <div>
            <label
              htmlFor="active-brightness"
              className="text-sm text-gray-300"
            >
              Active Brightness
            </label>
            <input
              id="active-brightness"
              type="range"
              min="0"
              max="100"
              value={activePercentage}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value);
                onBrightnessChange(inactivePercentage, value);
              }}
              className="w-full h-8 accent-blue-400 cursor-pointer"
            />
            <div className="text-xs text-gray-400">{activePercentage}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
