import React from "react";
import clsx from "clsx";
import { btnBaseClasses } from "./button";

interface CommandOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  command: string;
  output: string;
}

export function CommandOutputModal({
  isOpen,
  onClose,
  command,
  output,
}: CommandOutputModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl w-[800px] max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">
            Command Output: {command}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white -m-4 p-4"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
            {output}
          </pre>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className={clsx(btnBaseClasses, "border-gray-600 text-gray-300")}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
