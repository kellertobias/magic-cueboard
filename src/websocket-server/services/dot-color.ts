const colors: Array<[string, string]> = [
  ["warm white", "ffd7a3"], ["cold white", "e8f3ff"], ["cool white", "e8f3ff"],
  ["orange", "ff8000"], ["yellow", "ffff00"], ["green", "00ff00"],
  ["cyan", "00ffff"], ["blue", "0066ff"], ["magenta", "ff00ff"],
  ["purple", "8000ff"], ["pink", "ff4fa3"], ["amber", "ffbf00"],
  ["red", "ff0000"], ["cto", "ffb45b"], ["white", "ffffff"], ["uv", "7f00ff"],
];

export function dotColorFromName(name: string | null | undefined): string | null {
  const value = String(name ?? "").toLowerCase();
  for (const [word, color] of colors) {
    const escaped = word.replace(" ", "\\s+");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(value)) return color;
  }
  return null;
}
