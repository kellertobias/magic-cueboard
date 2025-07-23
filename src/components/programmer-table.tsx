"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { parameterGroups } from "@/parameter-groups";

type ProgrammerHead = {
  head: {
    name: string;
    type: string;
    no: string;
  };
  parameters: Record<string, Record<string, string>>;
};

export type WSMessage = {
  type: "programmer-update";
  data: {
    heads: ProgrammerHead[];
  };
};

const columns = Array.from(new Set(Object.values(parameterGroups))).sort(
  (a, b) => {
    // make sure that the order is Intensity, Pos, Color, then the rest and Control is last
    if (a === "Intensity") return -1;
    if (a === "Pos") return -1;
    if (a === "Color") return -1;
    if (a === "Control") return 1;
    return 0;
  }
);

/**
 * ProgrammerTable component displays lighting fixture programmer data in a tabular format.
 * It shows fixture heads with their parameters organized by categories like Intensity, Position, Color, etc.
 * Features alternating row colors, rounded borders, and real-time updates via WebSocket.
 */
export function ProgrammerTable() {
  const [heads, setHeads] = useState<ProgrammerHead[]>([]);

  /**
   * Handles incoming WebSocket messages to update the programmer data
   * @param message - WebSocket message containing programmer updates
   */
  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "programmer-update":
        setHeads(message.data.heads);
        break;
    }
  }, []);

  const { sendMessage } = useWebSocket(handleMessage, []);

  // Request only programmer updates when component mounts
  useEffect(() => {
    const interval = setInterval(() => {
      sendMessage({
        type: "get-programmer",
      });
    }, 500);

    return () => clearInterval(interval);
  }, [sendMessage]);

  /**
   * Renders parameter values for a given column and head
   * @param head - The fixture head data
   * @param column - The parameter column name
   * @returns JSX element containing parameter key-value pairs
   */
  const renderParameterCell = (head: ProgrammerHead, column: string) => {
    const parameters = head.parameters[column];
    if (!parameters || Object.keys(parameters).length === 0) {
      return <span className="text-gray-800">—</span>;
    }

    return (
      <div className="space-y-1">
        {Object.entries(parameters).map(([key, value]) => (
          <div
            key={key}
            className="text-xs font-semibold bg-[#FF5500] rounded-md relative text-white"
          >
            <div className="w-full text-xs bg-white/50 rounded-t-md px-0.5 py-px text-center">
              {key}
            </div>
            <div className="text-white mt-0.5 text-center">{value}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full w-full px-4 py-10 relative">
      {heads.length === 0 && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <div className="text-gray-500 text-sm">Programmer is Empty</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 font-mono">
          <thead>
            <tr>
              <th
                className={clsx(
                  "w-[75px] px-3 py-2 text-left font-semibold text-gray-200 bg-gray-950 border-t border-l border-gray-700 rounded-tl-lg",
                  heads.length === 0 && "border-b rounded-bl-lg"
                )}
              >
                #
              </th>
              <th
                className={clsx(
                  "w-[200px] px-3 py-2 text-left font-semibold text-gray-200 bg-gray-950 border-t border-l border-gray-700",
                  heads.length === 0 && "border-b"
                )}
              >
                Head
              </th>
              {columns.map((column, index) => (
                <th
                  key={column}
                  className={clsx(
                    "w-[120px] px-3 py-2 text-left font-semibold text-gray-200 bg-gray-950 border-t border-l border-gray-700",
                    index === columns.length - 1 && "border-r rounded-tr-lg",
                    index === columns.length - 1 &&
                      heads.length === 0 &&
                      "rounded-br-lg",
                    heads.length === 0 && "border-b"
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heads.map((head, rowIndex) => (
              <tr
                key={head.head.no}
                className={clsx(
                  "transition-colors hover:bg-gray-900/50 ",
                  rowIndex % 2 === 1 && "bg-gray-950"
                )}
              >
                <td className="px-3 py-3 text-right font-medium text-gray-300 border-l border-b border-gray-700 rounded-bl-lg">
                  {head.head.no}
                </td>
                <td className="px-3 py-3 border-l border-b border-gray-700">
                  <div className="font-medium text-gray-300">
                    {head.head.name}
                  </div>
                  <div className="text-sm text-gray-500">{head.head.type}</div>
                </td>
                {columns.map((column, colIndex) => (
                  <td
                    key={column}
                    className={clsx(
                      "px-3 py-3 border-l border-b border-gray-700 align-top",
                      colIndex === columns.length - 1 &&
                        "border-r rounded-br-lg"
                    )}
                  >
                    {renderParameterCell(head, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
