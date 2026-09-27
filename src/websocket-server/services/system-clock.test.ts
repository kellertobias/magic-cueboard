import { describe, expect, it, vi } from "vitest";
import { SystemClockService } from "./system-clock";

const timestamp = Date.UTC(2026, 8, 27, 12, 30, 15);
describe("system clock", () => {
  it("sets the selected instant on Save and writes an available RTC in UTC", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "yes\n" });
    const clock = new SystemClockService(run, "linux", () => true);
    await clock.set(timestamp, "manual");
    expect(run.mock.calls).toEqual([
      ["sudo", ["-n", "timedatectl", "show", "--property=NTP", "--value"]],
      ["sudo", ["-n", "timedatectl", "set-ntp", "false"]],
      ["sudo", ["-n", "date", "--set", `@${(timestamp / 1000).toFixed(3)}`]],
      ["sudo", ["-n", "hwclock", "--systohc", "--utc"]],
    ]);
  });
  it("takes the phone reference forward during command execution and works without an RTC", async () => {
    const monotonic = vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(2000);
    try {
      const run = vi.fn().mockResolvedValue({ stdout: "no" });
      await new SystemClockService(run, "linux", () => false).set(timestamp, "phone");
      expect(run).toHaveBeenLastCalledWith("sudo", ["-n", "date", "--set", `@${((timestamp + 2000) / 1000).toFixed(3)}`]);
      expect(run).toHaveBeenCalledTimes(3);
    } finally { monotonic.mockRestore(); }
  });
  it("rejects bad input and unsupported hosts before running commands", async () => {
    const run = vi.fn();
    const clock = new SystemClockService(run, "linux");
    for (const input of ["now", NaN, 0, Date.UTC(2100, 0, 1)]) await expect(clock.set(input, "manual")).rejects.toThrow("valid date");
    await expect(clock.set(timestamp, "unknown")).rejects.toThrow("source");
    await expect(new SystemClockService(run, "darwin").set(timestamp, "phone")).rejects.toThrow("Linux");
    expect(run).not.toHaveBeenCalled();
  });
  it("restores NTP and reports failure if setting the system time is denied", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "yes" });
    run.mockImplementationOnce(async () => ({ stdout: "yes" }))
      .mockImplementationOnce(async () => ({}))
      .mockImplementationOnce(async () => { throw new Error("Permission denied"); });
    await expect(new SystemClockService(run, "linux").set(timestamp, "manual")).rejects.toThrow("Permission denied");
    expect(run).toHaveBeenLastCalledWith("sudo", ["-n", "timedatectl", "set-ntp", "true"]);
  });
  it("reports a partial success if the RTC write fails", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "no" });
    run.mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => ({}))
      .mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => { throw new Error("RTC failure"); });
    const result = await new SystemClockService(run, "linux", () => true).set(timestamp, "manual");
    expect(result.warning).toContain("RTC could not be saved");
  });
});
