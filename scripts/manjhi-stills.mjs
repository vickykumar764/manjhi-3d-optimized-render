// usage: node scripts/manjhi-stills.mjs <outPrefix> <frame,frame,...> [scale]  (bundles once, SwiftShader, jpeg)
// MANJHI_ENTRY=src/sandboxes/<name>/index.tsx renders a sandbox copy instead of the main project entry.
// REMOTION_TMP must point at a big-drive folder: every bundle copies public/ into the temp dir.
import fs from "node:fs";
if (process.env.REMOTION_TMP) { fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true }); process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP; }
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const [prefix, frames, scale = "0.5"] = process.argv.slice(2);
// Full Chrome (Playwright's) FIRST: the headless-shell build cannot create a WebGL context on this VM
// (GL_VENDOR/GL_RENDERER = Disabled); the full Chrome binary renders WebGL via SwiftShader fine.
const candidates = [
  `${process.env.HOME}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
  "node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell",
];
const browserExecutable = candidates.find((c) => fs.existsSync(path.resolve(c)));
// Remotion 4.0.542: gl:"swiftshader" maps to the OBSOLETE --use-gl=swiftshader (GL disabled, three.js cannot
// create a context). The correct value is "swangle" -> --use-gl=angle --use-angle=swiftshader, which the
// Playwright probe confirmed gives WEBGL_OK ANGLE SwiftShader on this VM. (chromiumOptions.args is NOT
// supported in 4.0.542 — custom args are silently dropped.)
const chromiumOptions = { gl: "swangle" };
const serveUrl = await bundle({ entryPoint: path.resolve(process.env.MANJHI_ENTRY || "src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "ManjhiShort", browserExecutable, chromiumOptions });
const onBrowserLog = (l) => { if (l.type === "error" || l.type === "warning") console.log(`[${l.type}]`, l.text.slice(0, 300)); };
// MANJHI_POST='{"ink":false}' (JSON) overrides the composer's post toggles via inputProps — A/B switch for look tests.
const post = process.env.MANJHI_POST ? JSON.parse(process.env.MANJHI_POST) : undefined;
for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  await renderStill({ composition, serveUrl, frame: f, output: `${prefix}${f}.jpg`, imageFormat: "jpeg", jpegQuality: 88, scale: Number(scale),
    browserExecutable, chromiumOptions, timeoutInMilliseconds: 300000, onBrowserLog, ...(post ? { inputProps: { post } } : {}) });
  console.log("still", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
