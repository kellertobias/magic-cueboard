import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { btnBaseClasses } from "./button";

interface CommandOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  command: string;
  output: string;
}

/**
 * Modal component for displaying command execution output
 */
export function CommandOutputModal({
  isOpen,
  onClose,
  command,
  output,
}: CommandOutputModalProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Command Output</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white -m-4 p-4"
          >
            ✕
          </button>
        </div>

        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto font-mono text-sm text-gray-300 whitespace-pre-wrap mb-4"
        >
          {output}
        </div>
      </div>
    </div>
  );
}
