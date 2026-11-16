// Generates a deterministic, fully synthetic demo portrait (R9.2). It depicts no real
// person, uses no licensed assets, and is written to a git-ignored folder.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "../services/proxy/src/png.ts";

const WIDTH = 1280;
const HEIGHT = 720;
const outDir = join(process.cwd(), "demo-assets");
const outFile = join(outDir, "synthetic-portrait.png");

function mix(a: number[], b: number[], t: number): number[] {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
const cx = WIDTH / 2;
const headY = HEIGHT * 0.38;
const headR = HEIGHT * 0.17;
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    // A bright window behind the figure, so the demo shows a lighting suggestion.
    const glow = Math.max(0, 1 - Math.hypot(x - cx, y - HEIGHT * 0.3) / (WIDTH * 0.55));
    let color = mix([96, 108, 128], [236, 240, 246], glow);
    const dx = x - cx;
    if (dx * dx + (y - headY) ** 2 <= headR * headR) color = [118, 122, 132];
    else if (y > headY + headR * 0.85 && y < HEIGHT * 0.66 && Math.abs(dx) < headR * 0.42) color = [112, 116, 126];
    else if (y >= HEIGHT * 0.66 && Math.abs(dx) < WIDTH * 0.2 + (y - HEIGHT * 0.66) * 0.6) color = [70, 84, 104];
    rgb.set(color, (y * WIDTH + x) * 3);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, encodePng(WIDTH, HEIGHT, rgb));
console.log(`Wrote ${outFile} (${WIDTH}×${HEIGHT}, synthetic).`);
