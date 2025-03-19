import React, { useCallback, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import clsx from "clsx";
import { btnBaseClasses } from "./button";
import { WSMessage } from "./executor-grid";

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OptionsModal({ isOpen, onClose }: OptionsModalProps) {
  const [reloading, setReloading] = useState(false);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "show-setup":
        console.log(message.data);
        setReloading(false);
        break;
    }
  }, []);

  const { sendMessage } = useWebSocket(handleMessage, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl w-96">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Options</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="space-y-4">
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
              className={clsx(btnBaseClasses, "border-gray-600 text-gray-300")}
              onClick={() => {
                setReloading(true);
                sendMessage({ type: "reload-executors" });
              }}
            >
              {reloading ? "Reloading..." : "Reload from MagicQ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
