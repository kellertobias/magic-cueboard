export type PiMessage = {
  id: string;
  direction: "sent" | "received";
  text: string;
  timestamp: string;
};

export type PiMessagesState = {
  presets: string[];
  history: PiMessage[];
};

export const defaultPiMessagesState: PiMessagesState = {
  presets: ["You are too loud", "You are too quiet", "", "", "", ""],
  history: [],
};

export function validatePiMessagesState(value: unknown): PiMessagesState {
  if (!value || typeof value !== "object") return defaultPiMessagesState;
  const state = value as Partial<PiMessagesState>;
  const presets = [0, 1, 2, 3, 4, 5].map(index => {
    const text = Array.isArray(state.presets) ? state.presets[index] : undefined;
    return typeof text === "string" && text.trim().length <= 160
      ? text.trim()
      : defaultPiMessagesState.presets[index];
  });
  const history = Array.isArray(state.history) ? state.history.filter((item): item is PiMessage =>
    item && typeof item.id === "string" &&
    (item.direction === "sent" || item.direction === "received") &&
    typeof item.text === "string" && item.text.length <= 500 &&
    typeof item.timestamp === "string" && !Number.isNaN(Date.parse(item.timestamp))
  ).slice(-200) : [];
  return { presets, history };
}
