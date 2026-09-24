import { describe, expect, it } from "vitest";
import { findControllerPort } from "./button-controller";

describe("Cueboard serial discovery", () => {
  it("ignores built-in COM ports and selects a USB serial device", () => {
    expect(findControllerPort([
      { path: "COM1", pnpId: "ACPI\\PNP0501\\0" },
      { path: "COM3", pnpId: "USB\\VID_2341&PID_8037", vendorId: "2341" },
    ])).toBe("COM3");
    expect(findControllerPort([{ path: "COM1", pnpId: "ACPI\\PNP0501\\0" }])).toBeNull();
  });

  it("keeps discovering Linux USB serial devices", () => {
    expect(findControllerPort([{ path: "/dev/ttyACM0" }])).toBe("/dev/ttyACM0");
  });
});
