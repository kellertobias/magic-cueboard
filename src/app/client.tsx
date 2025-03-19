"use client";

import React, { useState } from "react";

import { SPLMeter } from "@/components/spl-meter";
import { ExecutorGrid } from "@/components/executor-grid";
import { ConnectionStatus } from "@/components/status";
import { OptionsModal } from "@/components/options-modal";
import clsx from "clsx";
import { Clock } from "@/components/clock";
import { WebSocketProvider } from "@/contexts/WebSocketContext";

export default function Home() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);

  return (
    <WebSocketProvider>
      <div className="flex justify-center items-center h-screen">
        <main
          className={clsx(
            "w-[1480px] h-[320px]",
            "outline outline-gray-900",
            "bg-black  overflow-hidden relative",
            "grid grid-cols-7"
          )}
        >
          <div className="col-span-2 flex flex-col h-[320px]">
            <div className="flex flex-row justify-center items-center pt-8 pb-1">
              <ConnectionStatus />
            </div>
            <div className="h-20">
              <Clock />
            </div>
            <div className="row-span-7">
              <SPLMeter />
            </div>
          </div>

          {/* Right Section - 4/5 width */}
          <div className="col-span-5 h-[320px]">
            <ExecutorGrid openSettings={() => setIsOptionsOpen(true)} />
          </div>
        </main>

        <OptionsModal
          isOpen={isOptionsOpen}
          onClose={() => setIsOptionsOpen(false)}
        />
      </div>
    </WebSocketProvider>
  );
}
