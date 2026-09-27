"use client";

import React, { useState } from "react";

import { SPLMeter } from "@/components/spl-meter";
import { ExecutorGrid } from "@/components/executor-grid";
import { ConnectionStatus } from "@/components/status";
import { OptionsModal } from "@/components/options-modal";
import clsx from "clsx";
import { Clock } from "@/components/clock";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { MessagesButton } from "@/components/messages-button";
import { DJMessages } from "@/components/dj-messages";

export default function Home() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);

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
          <div className="cueboard-sidebar col-span-2">
            <div className="min-w-0">
              <ConnectionStatus actions={<>
                <MessagesButton open={isMessagesOpen} onOpen={() => setIsMessagesOpen(true)} />
                <button type="button" aria-label="Settings" title="Settings" onClick={() => setIsOptionsOpen(true)}
                  className="cueboard-icon-button">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9.5 3-.5 3-2 1-2.8-1-2.5 4.3L4 12l-2.3 1.7L4.2 18 7 17l2 1 .5 3h5l.5-3 2-1 2.8 1 2.5-4.3L20 12l2.3-1.7L19.8 6 17 7l-2-1-.5-3Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </>} />
            </div>
            <div className="min-w-0">
              <Clock />
            </div>
            <div className="min-h-0">
              <SPLMeter />
            </div>
          </div>

          {/* Right Section - 4/5 width */}
          <div className="col-span-5 h-[320px]">
            <ExecutorGrid />
          </div>
          <DJMessages open={isMessagesOpen} onClose={() => setIsMessagesOpen(false)} />
        </main>

        <OptionsModal
          isOpen={isOptionsOpen}
          onClose={() => setIsOptionsOpen(false)}
        />
      </div>
    </WebSocketProvider>
  );
}
