import { useEffect, useState } from "react";
import { useWebSocket } from "./useWebSocket";

export function useSystemClock() {
  const [sample, setSample] = useState<{ timestamp: number; receivedAt: number; timeZone: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const { status, sendMessage } = useWebSocket((message: { type: string; data: any }) => {
    if (message.type === "clock-state" && Number.isFinite(message.data?.timestamp)) {
      setSample({ ...message.data, receivedAt: performance.now() });
      setElapsed(0);
    }
  });
  useEffect(() => {
    if (status !== "connected") { setSample(null); return; }
    sendMessage({ type: "get-clock" });
    const timer = setInterval(() => sendMessage({ type: "get-clock" }), 30000);
    return () => clearInterval(timer);
  }, [status, sendMessage]);
  useEffect(() => {
    if (!sample) return;
    const timer = setInterval(() => setElapsed(performance.now() - sample.receivedAt), 250);
    return () => clearInterval(timer);
  }, [sample]);
  return { time: sample ? new Date(sample.timestamp + elapsed) : null, timeZone: sample?.timeZone, status };
}
