"use client";

import React from "react";

import { ConnectionStatus } from "@/components/status";
import clsx from "clsx";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { ProgrammerTable } from "@/components/programmer-table";

export default function Programmer() {
  return (
    <WebSocketProvider>
      <div className="flex justify-center items-center h-screen w-screen p-2">
        <main
          className={clsx(
            "w-full h-full",
            "outline outline-gray-900",
            "bg-black  overflow-hidden relative",
            "relative"
          )}
        >
          <div className="absolute top-2 left-0 right-0 flex justify-center items-center">
            <ConnectionStatus />
          </div>
          <ProgrammerTable />
        </main>
      </div>
    </WebSocketProvider>
  );
}
