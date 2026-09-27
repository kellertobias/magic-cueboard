export type PiMessage = {
  id: string;
  direction: "sent" | "received";
  text: string;
  timestamp: string;
  recipient?: "dj" | "technician" | "group";
  sender?: "phone" | "qboard" | "dj";
};

export type MessagePresetSets = Record<"dj" | "group", string[]>;
export const defaultPiOutgoingPresets: MessagePresetSets = {
  dj: ["You are too loud", "You are too quiet", "Please call me", "", "", ""],
  group: ["Ready", "On my way", "Need help", "Please call me", "", ""],
};
export const defaultPhonePresets: MessagePresetSets = {
  dj: ["Audio problem", "Light problem", "Need assistance", "", "", ""],
  group: ["On my way", "Ready", "Need help", "Thanks", "", ""],
};
export function validatePresetSets(value: unknown, defaults: MessagePresetSets): MessagePresetSets {
  const input = value as Partial<MessagePresetSets> | null;
  const bank = (destination: "dj" | "group") => Array.from({ length: 6 }, (_, index) => {
    const text = input && Array.isArray(input[destination]) ? input[destination]?.[index] : undefined;
    return typeof text === "string" && text.trim().length <= 160 ? text.trim() : defaults[destination][index];
  });
  return { dj: bank("dj"), group: bank("group") };
}
export const PHONE_PRESETS_STORAGE_KEY = "light-assistant.phone-presets.v1";

export type PiMessagesState = {
  presets: string[];
  outgoingPresets?: MessagePresetSets;
  history: PiMessage[];
};

export const defaultPiMessagesState: PiMessagesState = {
  presets: ["You are too loud", "You are too quiet", "", "", "", ""],
  outgoingPresets: defaultPiOutgoingPresets,
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
  ).slice(-200).map(item => ({
    id: item.id, direction: item.direction, text: item.text, timestamp: item.timestamp,
    ...(item.recipient === "dj" || item.recipient === "technician" || item.recipient === "group" ? { recipient: item.recipient } : {}),
    ...(item.sender === "phone" || item.sender === "qboard" || item.sender === "dj" ? { sender: item.sender } : {}),
  })) : [];
  return { presets, history, outgoingPresets: validatePresetSets(state.outgoingPresets, { dj: presets, group: defaultPiOutgoingPresets.group }) };
}

export function messageRecipientLabel(recipient: PiMessage["recipient"]): string {
  return recipient === "dj" ? "DJ display" : recipient === "technician" ? "Technician" : recipient === "group" ? "Group chat" : "";
}
