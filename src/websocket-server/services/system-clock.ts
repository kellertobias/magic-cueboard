import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execute = promisify(execFile);
type Runner = (file: string, args: string[]) => Promise<unknown>;

export function validateClockTimestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < Date.UTC(2020, 0, 1) || value >= Date.UTC(2100, 0, 1)) {
    throw new Error("Choose a valid date and time between 2020 and 2099.");
  }
  return value;
}

export class SystemClockService {
  private saving = false;
  constructor(
    private run: Runner = (file, args) => execute(file, args, { timeout: 10000 }),
    private platform = process.platform,
    private hasRTC: () => boolean = () => existsSync("/dev/rtc0") || existsSync("/dev/rtc"),
  ) {}

  snapshot() {
    return { timestamp: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }

  async set(timestamp: unknown, source: unknown) {
    const target = validateClockTimestamp(timestamp);
    if (source !== "phone" && source !== "manual") throw new Error("Clock source must be phone or manual.");
    if (this.platform !== "linux") throw new Error("Setting the system clock is supported on the Linux Qboard host only.");
    if (this.saving) throw new Error("A clock update is already in progress. Please retry.");
    this.saving = true;
    const started = performance.now();
    let restoreNTP = false;
    let systemTimeSet = false;
    try {
      const result = await this.run("sudo", ["-n", "timedatectl", "show", "--property=NTP", "--value"]) as { stdout?: string };
      restoreNTP = result?.stdout?.trim() === "yes";
      // Disable network time so it cannot immediately undo the selected time.
      await this.run("sudo", ["-n", "timedatectl", "set-ntp", "false"]);
      const effective = source === "phone" ? target + (performance.now() - started) : target;
      await this.run("sudo", ["-n", "date", "--set", `@${(effective / 1000).toFixed(3)}`]);
      systemTimeSet = true;
      let warning: string | undefined;
      if (this.hasRTC()) {
        try { await this.run("sudo", ["-n", "hwclock", "--systohc", "--utc"]); }
        catch { warning = "System time was set, but the hardware RTC could not be saved."; }
      }
      return { ...this.snapshot(), warning };
    } catch (error) {
      if (restoreNTP && !systemTimeSet) {
        try { await this.run("sudo", ["-n", "timedatectl", "set-ntp", "true"]); }
        catch { throw new Error("Clock update failed and network time could not be restored. Check the host's time settings."); }
      }
      throw error;
    } finally { this.saving = false; }
  }
}
