import { describe, expect, it } from "vitest";
import { ButtonControllerService, findControllerPort, shouldStartLocalCueboard } from "./button-controller";

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

  it("does not resend unchanged LED state on every MagicQ snapshot", () => {
    const sent: string[] = [];
    const board = new ButtonControllerService(null) as unknown as {
      isConnected: boolean;
      port: { write: (value: string) => void };
      setButtonColor: (button: number, color: string) => void;
      setButtonActive: (button: number, active: boolean) => void;
    };
    board.isConnected = true;
    board.port = { write: (value) => { sent.push(value); } };
    for (let snapshot = 0; snapshot < 10; snapshot++) {
      for (let button = 0; button < 40; button++) {
        board.setButtonColor(button, "f80");
        board.setButtonActive(button, false);
      }
    }
    expect(sent).toHaveLength(80);
    board.setButtonActive(0, true);
    expect(sent).toHaveLength(81);
  });
});
