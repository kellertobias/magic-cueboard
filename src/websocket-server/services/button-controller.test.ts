import { describe, expect, it } from "vitest";
import { findControllerPort, shouldStartLocalCueboard } from "./button-controller";

describe("Cueboard serial discovery", () => {
  it("opens Pi USB discovery while leaving Windows bridge ownership intact", () => {
    expect(shouldStartLocalCueboard("linux", null)).toBe(true);
    expect(shouldStartLocalCueboard("win32", null)).toBe(false);
    expect(shouldStartLocalCueboard("win32", "COM3")).toBe(true);
  });
  it("ignores built-in COM ports and selects a USB serial device", () => {
    expect(findControllerPort([
      { path: "COM1", pnpId: "ACPI\\PNP0501\\0" },
      { path: "COM3", pnpId: "USB\\VID_2341&PID_8037", vendorId: "2341", productId: "8037" },
    ])).toBe("COM3");
    expect(findControllerPort([{ path: "COM1", pnpId: "ACPI\\PNP0501\\0" }])).toBeNull();
  });

  it("discovers the Cueboard without claiming another USB serial device", () => {
    expect(findControllerPort([
      { path: "/dev/ttyUSB0", vendorId: "10c4", productId: "ea60" },
      { path: "/dev/ttyACM0", vendorId: "2341", productId: "8037" },
    ])).toBe("/dev/ttyACM0");
    expect(findControllerPort([{ path: "/dev/ttyUSB0", vendorId: "10c4", productId: "ea60" }])).toBeNull();
  });
});
