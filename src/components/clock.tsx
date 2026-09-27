"use client";

import { useSystemClock } from "@/hooks/useSystemClock";

export function Clock() {
  const { time, timeZone } = useSystemClock();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    });
  };

  return (
    <div className="cueboard-clock">
      <time className="cueboard-clock-time">{time ? formatTime(time) : "--:--:--"}</time>
      <div className="cueboard-clock-date">
        <span>{time?.toLocaleDateString("en-US", { weekday: "long", timeZone }) ?? "Device time"}</span>
        <span>{time?.toLocaleDateString("de-DE", { year: "2-digit", month: "2-digit", day: "2-digit", timeZone }) ?? "—"}</span>
      </div>
    </div>
  );
}
