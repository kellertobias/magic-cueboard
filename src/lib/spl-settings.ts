export type SPLColor = "blue" | "green" | "yellow" | "red" | "red-blink";
export type SPLThresholds = { green: number; yellow: number; red: number };
export type SPLSettings = {
  average: SPLThresholds;
  peak: SPLThresholds;
  averageSeconds: number;
  peakSeconds: number;
  redBlinkSeconds: number;
  messageTopic: string;
  messages: string[];
};

export const defaultSPLSettings: SPLSettings = {
  average: { green: 70, yellow: 80, red: 93 },
  peak: { green: 70, yellow: 80, red: 93 },
  averageSeconds: 24,
  peakSeconds: 1,
  redBlinkSeconds: 5,
  messageTopic: "tosklight/dj/message",
  messages: ["Audio problem", "Light problem", "Yes", "No", "", ""],
};

export function validateSPLSettings(value: unknown): SPLSettings {
  if (!value || typeof value !== "object") throw new Error("Invalid SPL settings.");
  const input = value as Record<string, unknown>;
  const thresholds = (key: string): SPLThresholds => {
    const item = input[key] as Record<string, unknown> | undefined;
    const green = Number(item?.green), yellow = Number(item?.yellow), red = Number(item?.red);
    if (![green, yellow, red].every(n => Number.isFinite(n) && n >= 0 && n <= 200) || !(green < yellow && yellow < red)) {
      throw new Error(`${key} thresholds must increase from blue to red.`);
    }
    return { green, yellow, red };
  };
  const bounded = (key: string, min: number, max: number) => {
    const number = Number(input[key]);
    if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${key} must be between ${min} and ${max}.`);
    return number;
  };
  const messageTopic = input.messageTopic;
  if (typeof messageTopic !== "string" || !messageTopic.trim() || messageTopic.length > 200 || /[#+\u0000]/.test(messageTopic)) {
    throw new Error("Message topic must be a valid MQTT topic without wildcards.");
  }
  if (!Array.isArray(input.messages) || input.messages.length !== 6 || input.messages.some(m => typeof m !== "string" || m.length > 160)) {
    throw new Error("Configure six messages of at most 160 characters each.");
  }
  return {
    average: thresholds("average"), peak: thresholds("peak"),
    averageSeconds: bounded("averageSeconds", 1, 120),
    peakSeconds: bounded("peakSeconds", 0.1, 30),
    redBlinkSeconds: bounded("redBlinkSeconds", 0, 120),
    messageTopic: messageTopic.trim(), messages: input.messages,
  };
}

export function splColor(value: number, thresholds: SPLThresholds): Exclude<SPLColor, "red-blink"> {
  if (value >= thresholds.red) return "red";
  if (value >= thresholds.yellow) return "yellow";
  if (value >= thresholds.green) return "green";
  return "blue";
}

export function worstSPLColor(average: number, peak: number, settings: SPLSettings): Exclude<SPLColor, "red-blink"> {
  const colors = ["blue", "green", "yellow", "red"];
  const a = splColor(average, settings.average);
  const p = splColor(peak, settings.peak);
  return colors[Math.max(colors.indexOf(a), colors.indexOf(p))] as Exclude<SPLColor, "red-blink">;
}
