import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { btnBaseClasses } from "./button";
import { systemCommands } from "@/system-commands";

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  command: string;
  onConfirm: () => void;
  output: (string | React.ReactNode)[];
  isExecuting: boolean;
  hasError: boolean;
}

/**
 * Modal component that looks like a terminal window with command confirmation and execution
 */
export function TerminalModal({
  isOpen,
  onClose,
  command,
  onConfirm,
  output,
  hasError,
  isExecuting,
}: TerminalModalProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const [showCloseButton, setShowCloseButton] = useState(false);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      const scrollToBottom = () => {
        outputRef.current!.scrollTop = outputRef.current!.scrollHeight;
      };

      // Initial scroll
      scrollToBottom();

      // Create a mutation observer to watch for content changes
      const observer = new MutationObserver(scrollToBottom);
      observer.observe(outputRef.current, { childList: true, subtree: true });

      return () => observer.disconnect();
    }
  }, [output]);

  // Show close button when command is done executing
  useEffect(() => {
    if (!isExecuting && output) {
      setShowCloseButton(true);
    }
  }, [isExecuting, output]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-[800px] flex flex-col max-h-[280px] overflow-y-scroll">
        {/* Terminal Content */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto font-mono text-sm text-gray-300 whitespace-pre-wrap bg-black p-4 rounded-t-lg"
          style={{ maxHeight: "calc(100vh - 12rem)" }}
        >
          {!output ? (
            <>
              <div>
                <span className="text-yellow-400">$ {command}:</span>
                <br />
                {systemCommands[command as keyof typeof systemCommands]}
              </div>
              <div className="mt-2 text-yellow-400">Execute this command?</div>
            </>
          ) : hasError ? (
            <div>
              <span className="text-red-500">$ {command}</span>
              <br />
              <span className="text-red-500/40">
                {systemCommands[command as keyof typeof systemCommands]}
              </span>
            </div>
          ) : (
            <div>
              <span className="text-green-400">$ {command}</span>
              <br />
              <span className="text-green-400/40">
                {systemCommands[command as keyof typeof systemCommands]}
              </span>
            </div>
          )}
          {output && <div className="mt-2">{output}</div>}
        </div>

        {/* Terminal Footer */}
        <div className="flex justify-end gap-2 p-4 bg-gray-900 rounded-b-lg border-t border-gray-800">
          {!output ? (
            <>
              <button
                onClick={onClose}
                className={clsx(
                  btnBaseClasses,
                  "border-gray-600 text-gray-300"
                )}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className={clsx(
                  btnBaseClasses,
                  "border-green-600 text-green-300"
                )}
              >
                Execute
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className={clsx(btnBaseClasses, "border-gray-600 text-gray-300")}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
