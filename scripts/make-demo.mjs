#!/usr/bin/env node
/**
 * Builds docs/demo.svg: an animated terminal recording for the README.
 *
 * It is NOT hand-drawn. The script runs the real, built CLI on a small demo project,
 * captures the colored output, and turns it into an SVG that "types" the command and
 * reveals the report line by line. If the tool's output changes, run this again.
 *
 *   npm run build
 *   node scripts/make-demo.mjs                 # animated  -> docs/demo.svg
 *   node scripts/make-demo.mjs --static --out=/tmp/demo-static.svg   # no animation (for previews)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const STATIC = process.argv.includes("--static");
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ?? "docs/demo.svg";
const COMMAND = "npx dev-view local";

// ---------------------------------------------------------------- 1. a small demo project

const base = mkdtempSync(join(tmpdir(), "dev-view-demo-"));
const project = join(base, "my-app");

const files = {
  "package.json": JSON.stringify(
    {
      name: "my-app",
      version: "1.0.0",
      description: "A small web app",
      license: "MIT",
      engines: { node: ">=22" },
      scripts: { start: "node src/index.js", test: "vitest run" },
      dependencies: { express: "^4.19.0" },
    },
    null,
    2,
  ),
  "package-lock.json": "{}\n",
  "README.md": "# my-app\n",
  ".gitignore": "node_modules/\ndist/\n",
  "src/index.js": "console.log('hello');\n",
  "tests/app.test.js": "// a test\n",
  ".env": "PORT=3000\nDB_PASSWORD=not-a-real-password\n", // the mistake the demo will catch
};

for (const [path, content] of Object.entries(files)) {
  const target = join(project, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
const git = (...args) =>
  execFileSync("git", ["-c", "user.name=Demo", "-c", "user.email=demo@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd: project,
    stdio: "ignore",
  });
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", "initial commit");

// ---------------------------------------------------------------- 2. run the real CLI, keep the colors

const env = { ...process.env, FORCE_COLOR: "1" };
delete env.NO_COLOR;
const raw = execFileSync(process.execPath, ["dist/cli.js", "local", project], { env, encoding: "utf8" });
rmSync(base, { recursive: true, force: true });

// ---------------------------------------------------------------- 3. ANSI colors -> styled runs

const PALETTE = {
  30: "#0d1117", 31: "#ff7b72", 32: "#3fb950", 33: "#d29922",
  34: "#58a6ff", 35: "#bc8cff", 36: "#39c5cf", 37: "#f0f6fc",
};
const CLASS_FOR = Object.fromEntries(Object.entries(PALETTE).map(([code, color]) => [color, `c${code}`]));

function parseLine(line) {
  const runs = [];
  let state = { fg: null, bg: null, bold: false, dim: false };
  let last = 0;

  const push = (text) => {
    if (text) runs.push({ text, ...state });
  };

  for (const match of line.matchAll(/\x1B\[([0-9;]*)m/g)) {
    push(line.slice(last, match.index));
    last = match.index + match[0].length;

    for (const part of match[1].split(";")) {
      const code = Number(part || 0);
      if (code === 0) state = { fg: null, bg: null, bold: false, dim: false };
      else if (code === 1) state = { ...state, bold: true };
      else if (code === 2) state = { ...state, dim: true };
      else if (code === 22) state = { ...state, bold: false, dim: false };
      else if (code >= 30 && code <= 37) state = { ...state, fg: PALETTE[code] };
      else if (code === 39) state = { ...state, fg: null };
      else if (code >= 40 && code <= 47) state = { ...state, bg: PALETTE[code - 10] };
      else if (code === 49) state = { ...state, bg: null };
    }
  }
  push(line.slice(last));
  return runs;
}

const outputLines = raw.replace(/\s+$/, "").split("\n").map(parseLine);

// ---------------------------------------------------------------- 4. layout

const CHAR_W = 7.8; // width of one character cell
const LINE_H = 20;
const PAD_X = 22;
const BAR_H = 38;
const FIRST_BASELINE = BAR_H + 30;
const COLS = 100;

const plain = (runs) => runs.map((r) => r.text).join("");
const rows = [[{ text: "", fg: null, bg: null, bold: false, dim: false }], ...outputLines]; // row 0 = the prompt
const WIDTH = Math.round(COLS * CHAR_W + PAD_X * 2);
const HEIGHT = Math.round(FIRST_BASELINE + rows.length * LINE_H + 8);

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- 5. timeline

const TYPE_START = 0.7;
const TYPE_STEP = 0.07;
const ENTER_AT = TYPE_START + COMMAND.length * TYPE_STEP + 0.55;
const LINE_STEP = 0.07;
const SECTION_PAUSE = 0.22;
const HOLD = 5.5;
const FADE = 0.8;

const reveal = []; // when each output row appears
let t = ENTER_AT;
for (const runs of outputLines) {
  const blank = plain(runs).trim() === "";
  t += blank ? SECTION_PAUSE : LINE_STEP;
  reveal.push(t);
}
const TOTAL = (reveal.at(-1) ?? ENTER_AT) + HOLD + FADE;

const keyframes = [];
let animCount = 0;

/** Returns inline style that shows an element at `start` seconds and loops with everything else. */
function appear(start, property = "opacity") {
  if (STATIC) return "";
  const name = `k${animCount++}`;
  const a = ((start / TOTAL) * 100).toFixed(3);
  const b = (((TOTAL - FADE) / TOTAL) * 100).toFixed(3);
  keyframes.push(
    `@keyframes ${name}{0%,${a}%{${property}:0}${(Number(a) + 0.01).toFixed(3)}%,${b}%{${property}:1}100%{${property}:0}}`,
  );
  return ` style="animation:${name} ${TOTAL.toFixed(2)}s linear infinite"`;
}

// ---------------------------------------------------------------- 6. build the SVG

const parts = [];
const y = (row) => FIRST_BASELINE + row * LINE_H;

// the prompt line: "$ " then one tspan per typed character
{
  const typed = [...COMMAND]
    .map((ch, i) => `<tspan class="ty"${appear(TYPE_START + i * TYPE_STEP, "fill-opacity")}>${esc(ch)}</tspan>`)
    .join("");
  const cursorX = PAD_X + (2 + COMMAND.length) * CHAR_W;
  const cursorStart = 0.3;
  const cursor = STATIC
    ? ""
    : (() => {
        const name = `k${animCount++}`;
        const a = ((cursorStart / TOTAL) * 100).toFixed(3);
        const b = ((ENTER_AT / TOTAL) * 100).toFixed(3);
        keyframes.push(`@keyframes ${name}{0%,${a}%{opacity:0}${(Number(a) + 0.01).toFixed(3)}%,${b}%{opacity:1}${(Number(b) + 0.01).toFixed(3)}%,100%{opacity:0}}`);
        return `<rect x="${PAD_X}" y="${y(0) - 14}" width="${CHAR_W}" height="18" rx="1" class="cur" style="animation:${name} ${TOTAL.toFixed(2)}s linear infinite"/>`;
      })();
  void cursorX;
  parts.push(
    `<g>${cursor}<text x="${PAD_X}" y="${y(0)}" xml:space="preserve"><tspan class="c32 b">$</tspan> ${typed}</text></g>`,
  );
}

// the report, one group per line
outputLines.forEach((runs, i) => {
  const row = i + 1;
  const text = plain(runs);
  if (text.trim() === "") return;

  let col = 0;
  let backgrounds = "";
  const spans = runs
    .map((run) => {
      const width = [...run.text].length;
      if (run.bg) {
        backgrounds += `<rect x="${(PAD_X + col * CHAR_W).toFixed(2)}" y="${y(row) - 14}" width="${(width * CHAR_W).toFixed(2)}" height="19" fill="${run.bg}"/>`;
      }
      col += width;
      const classes = [run.fg ? CLASS_FOR[run.fg] : "", run.bold ? "b" : "", run.dim ? "d" : ""].filter(Boolean).join(" ");
      return classes ? `<tspan class="${classes}">${esc(run.text)}</tspan>` : esc(run.text);
    })
    .join("");

  // textLength pins every line to the same character grid, so columns line up in any font
  parts.push(
    `<g${appear(reveal[i])}>${backgrounds}<text x="${PAD_X}" y="${y(row)}" xml:space="preserve" textLength="${(col * CHAR_W).toFixed(2)}" lengthAdjust="spacing">${spans}</text></g>`,
  );
});

const colorCss = Object.entries(PALETTE)
  .map(([code, color]) => `.c${code}{fill:${color}}`)
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="t d">
<title id="t">Dev View analyzing a project</title>
<desc id="d">A terminal runs "${COMMAND}". Dev View reports one error (a committed .env file) and one warning (no LICENSE), and gives the project a score of 87 out of 100.</desc>
<style>
text{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono","DejaVu Sans Mono",monospace;font-size:13px;fill:#c9d1d9;white-space:pre}
.b{font-weight:700}.d{fill:#8b949e}.ty{fill:#f0f6fc}.cur{fill:#58a6ff}
${colorCss}
${STATIC ? "" : keyframes.join("\n")}
@media (prefers-reduced-motion:reduce){g,tspan,rect.cur{animation:none!important;opacity:1!important;fill-opacity:1!important}}
</style>
<rect x=".5" y=".5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="10" fill="#0d1117" stroke="#30363d"/>
<path d="M.5 ${BAR_H}V10.5a10 10 0 0 1 10-10h${WIDTH - 21}a10 10 0 0 1 10 10V${BAR_H}z" fill="#161b22"/>
<line x1=".5" y1="${BAR_H}" x2="${WIDTH - 0.5}" y2="${BAR_H}" stroke="#30363d"/>
<circle cx="22" cy="${BAR_H / 2}" r="6" fill="#ff5f56"/><circle cx="42" cy="${BAR_H / 2}" r="6" fill="#ffbd2e"/><circle cx="62" cy="${BAR_H / 2}" r="6" fill="#27c93f"/>
<text x="${WIDTH / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" style="fill:#8b949e;font-size:12px">dev-view</text>
${parts.join("\n")}
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`${OUT}: ${WIDTH}x${HEIGHT}px, ${outputLines.length} output lines, ${STATIC ? "static" : `animated, ${TOTAL.toFixed(1)}s loop`}`);
