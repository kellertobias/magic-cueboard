import React from "react";
import clsx from "clsx";
import { btnBaseClasses } from "./button";

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl w-[400px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">
            Button Brightness
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white -m-4 p-4"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-sm text-gray-300">Inactive Brightness</label>
            <input
              type="range"
              min="0"
              max="100"
              value={inactivePercentage}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                onBrightnessChange(value, activePercentage);
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-xs text-gray-400">{inactivePercentage}%</div>
          </div>

          <div>
            <label className="text-sm text-gray-300">Active Brightness</label>
            <input
              type="range"
              min="0"
              max="100"
              value={activePercentage}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                onBrightnessChange(inactivePercentage, value);
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-xs text-gray-400">{activePercentage}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
