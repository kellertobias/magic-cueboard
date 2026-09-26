import { type SPLColor, type SPLSettings, worstSPLColor } from "../../lib/spl-settings";

export type SPLState = { average: number; peak: number; color: SPLColor; measured: number; freqMode: string };

export class SPLStateCalculator {
  private samples: { value: number; at: number }[] = [];
  private redSince: number | null = null;
  private last: { value: number; freqMode: string } | null = null;

  update(value: number, freqMode: string, settings: SPLSettings, at = Date.now()): SPLState {
    if (!Number.isFinite(value) || value < 0 || value > 200) throw new Error("Invalid SPL value.");
    this.last = { value, freqMode };
    this.samples.push({ value, at });
    this.samples = this.samples.filter(sample => at - sample.at <= Math.max(settings.averageSeconds, settings.peakSeconds) * 1000);
    return this.calculate(settings, at)!;
  }

  calculate(settings: SPLSettings, at = Date.now()): SPLState | null {
    if (!this.last) return null;
    const averageSamples = this.samples.filter(sample => at - sample.at <= settings.averageSeconds * 1000);
    const peakSamples = this.samples.filter(sample => at - sample.at <= settings.peakSeconds * 1000);
    const average = averageSamples.length ? averageSamples.reduce((sum, item) => sum + item.value, 0) / averageSamples.length : this.last.value;
    const peak = peakSamples.length ? Math.max(...peakSamples.map(item => item.value)) : this.last.value;
    const base = worstSPLColor(average, peak, settings);
    if (base === "red") this.redSince ??= at;
    else this.redSince = null;
    const color: SPLColor = base === "red" && at - this.redSince! >= settings.redBlinkSeconds * 1000 ? "red-blink" : base;
    return { average: Number(average.toFixed(1)), peak: Number(peak.toFixed(1)), color, measured: this.last.value, freqMode: this.last.freqMode };
  }
}
