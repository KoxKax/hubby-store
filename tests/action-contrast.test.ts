import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync("app/styles/visual-polish.css", "utf8");
function rgb(hex: string) {
  return [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset + 1, offset + 3), 16),
  );
}
function luminance(channels: number[]) {
  const linear = channels.map((value) => {
    const scaled = value / 255;
    return scaled <= 0.04045
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return (
    (linear[0] ?? 0) * 0.2126 +
    (linear[1] ?? 0) * 0.7152 +
    (linear[2] ?? 0) * 0.0722
  );
}
describe("white action text contrast", () => {
  it("keeps the actual action gradient above4.5:1, including interpolated colors", () => {
    const colors = ["start", "middle", "end"].map((key) => {
      const match = stylesheet.match(
        new RegExp(`--action-${key}:\\s*(#[0-9a-f]{6})`, "i"),
      );
      if (!match?.[1]) throw new Error(`Missing action token ${key}`);
      return rgb(match[1]);
    });
    for (let index = 0; index < colors.length - 1; index++) {
      const left = colors[index] ?? [],
        right = colors[index + 1] ?? [];
      for (let step = 0; step <= 20; step++) {
        const channels = left.map(
          (value, channel) =>
            value + (((right[channel] ?? 0) - value) * step) / 20,
        );
        expect(1.05 / (luminance(channels) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
