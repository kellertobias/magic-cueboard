"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface WebSocketContextType {
  status: "connecting" | "connected" | "disconnected";
  disconnectedSince: number | null;
  sendMessage: (message: unknown) => void;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  addMessageListener: (listener: (data: any) => void) => () => void;
}

export const WebSocketContext = createContext<WebSocketContextType | null>(
  null
);

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider"
    );
  }
  return context;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(
    null
  );
  const wsRef = useRef<WebSocket | null>(null);
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const messageListenersRef = useRef<Set<(data: any) => void>>(new Set());

  const connect = React.useCallback(() => {
    try {
      console.log("Connecting to WebSocket");
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setStatus("connected");
        setDisconnectedSince(null);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        const now = Date.now();
        setStatus("disconnected");
        setDisconnectedSince(now);
        wsRef.current = null;

        // Attempt to reconnect after 1 second
        setTimeout(() => {
          setStatus("connecting");
          connect();
        }, 1000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // biome-ignore lint/complexity/noForEach: <explanation>
          messageListenersRef.current.forEach((listener) => {
            try {
              listener(data);
            } catch (error) {
              console.error("Error in message listener:", error);
            }
          });
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      setStatus("disconnected");
      const now = Date.now();
      setDisconnectedSince(now);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const sendMessage = React.useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const addMessageListener = React.useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (listener: (data: any) => void) => {
      if (typeof listener !== "function") {
        return () => {};
      }

      messageListenersRef.current.add(listener);
      return () => {
        messageListenersRef.current.delete(listener);
      };
    },
    []
  );

  return (
    <WebSocketContext.Provider
      value={{
        status,
        disconnectedSince,
        sendMessage,
        addMessageListener,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
