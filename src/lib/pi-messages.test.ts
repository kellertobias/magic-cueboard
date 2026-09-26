import { describe, expect, it } from "vitest";
import { validatePiMessagesState } from "./pi-messages";

describe("Pi message storage", () => {
  it("keeps two Pi presets separate from DJ settings and bounds conversation history", () => {
    const history = Array.from({ length: 205 }, (_, index) => ({
      id: String(index), direction: index % 2 ? "received" : "sent",
      text: `Message ${index}`, timestamp: "2026-09-26T12:00:00.000Z",
    }));
    const state = validatePiMessagesState({ presets: ["Custom one", "Custom two"], history });
    expect(state.presets).toEqual(["Custom one", "Custom two"]);
    expect(state.history).toHaveLength(200);
    expect(state.history[0].id).toBe("5");
    expect(state.history[199].direction).toBe("sent");
  });

  it("rejects malformed saved entries and restores default presets", () => {
    const state = validatePiMessagesState({ presets: ["", "x".repeat(161)], history: [
      { id: "bad", direction: "received", text: "Invalid date", timestamp: "not a date" },
    ] });
    expect(state.presets).toEqual(["You are too loud", "You are too quiet"]);
    expect(state.history).toEqual([]);
  });
});
