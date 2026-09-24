import { describe, expect, it } from "vitest";
import { normalizeToskLightSurface, toskLightExecutorAction } from "./tosklight-api";

describe("ToskLight surface projection", () => {
  it("projects the selected page with names, colours, type and live state", () => {
    const snapshot = normalizeToskLightSurface({ active_show: { id: "show", name: "Gala" } }, { active_page: 2, pages: [{ number: 2, slots: { "1": 7 } }], pool: [{ number: 7, name: "Blue Wash", color: "#2040ff", buttons: ["flash", "pause", "flash"] }], active: [{ playback_number: 7 }] });
    expect(snapshot).toMatchObject({ source: "tosklight", showName: "Gala", connected: true });
    expect(snapshot.executors[1]).toMatchObject({ name: "Blue Wash", color: "2040ff", mode: "FL", value: 1 });
  });
});

describe("ToskLight executor actions", () => {
  it("targets the same first configured physical button as the Windows bridge", () => {
    expect(toskLightExecutorAction(2, 7, "press")).toMatchObject({ address: { kind: "explicit_page", page: 2, slot: 7 }, action: { type: "configured_button", number: 1, pressed: true }, surface: "physical" });
    expect(toskLightExecutorAction(2, 7, "release")).toMatchObject({ action: { type: "configured_button", number: 1, pressed: false } });
  });
});
