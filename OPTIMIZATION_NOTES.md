# Manjhi 3D short — OPTIMIZED copy (2026-11-10)

This is a copy of `~/workspace/manjhi-3d-short/` with CPU cost-cutting
optimizations applied, for a GitHub Actions speed test. **The original project
is untouched.** Story, script, voice, audio and frame count (1,254 frames,
30 fps, 1080x1920 output) are identical.

## What changed (only `src/videos/manjhi/Manjhi.tsx` + `package.json`)

### 1. Half-resolution render + CSS upscale (biggest win)
- `ThreeCanvas` now renders at **540x960** (was 1080x1920) inside a div
  `transform: scale(2)` so the 1080x1920 composition still outputs 1080x1920.
- The whole post chain (ink + grade) and the main scene render run at
  **quarter pixels** (~4x less fragment work).
- Pixel-sized post parameters scale with output height, so the look keeps
  the same relative sizes: ink `pxScale = height/1920` (ink.ts `setSize`),
  card-shade rim `uPx = render height/1920` (cast.ts). At 540 buffer height
  the ink line is 2.55 px in the buffer = 5.1 px on screen after the 2x
  upscale — identical to the original.
- The `PostDriver` composer sizes itself from `gl.getSize()`, so it also
  runs at 540x960. **The PostDriver pattern itself is UNCHANGED**
  (synchronous `useMemo` composer + priority-1 `useFrame`) — never use the
  `<EffectComposer>` wrapper in Remotion render mode (blank-canvas bug, see
  `work/blank-canvas-fix.md` in the Ancient Jar project).
- MSAA 4 and HalfFloat composer kept (look protection: ink + character
  cards need the AA; dropping them would alias the outlines).

### 2. Lens blur + bloom OFF by default
- Default toggles in `toggles()`: `lens: false, pre: false, bloom: false`
  (was all `true`). Post chain is now:
  `RenderPass -> InkPass -> ONE merged EffectPass (NEUTRAL tone + grade)`.
- RENDER_PLAN.md measured DOF at ~30 s/frame (~40% of the per-frame cost)
  locally; bloom adds a 6-level MIP chain on top.
- **Look tradeoff (deliberate, this experiment's question): the depth of
  field is GONE — backgrounds are sharp now**, so the eye no longer goes
  to the character the way the style bible wants ("backgrounds blurry").
  The speed test will show whether the time saved is worth it; the
  unoptimized project is still there if the look matters more.
- Restore the full chain with inputProps `{ post: { lens: true, bloom: true } }`
  (the stills script supports it via `MANJHI_POST`).

## What was deliberately NOT changed (checked, not skipped blindly)

### 3. Static-background baking — NOT done
- The camera glides inside every shot (0.15–0.25 %/frame creep, cuts only
  on big jumps) and the ridge slides apart as the cut opens, so no
  background is static across a shot. Baking would need a per-shot
  cubemap re-projection — a big refactor with parallax risk. The sky is
  already a cheap 5-stop gradient shader, and the post chain + resolution
  dominate the cost. Skipped.

### 4. MeshBasicMaterial for static props — NOT done
- All static props use `MeshLambertMaterial` + the two-tone shader
  (`shade.ts`), which IS the toon look (sun/shadow two-tone, purple
  sunset shadows). Switching to unlit basic materials would kill the
  sun/shadow shading the style bible measures. Clouds and the crack
  already use MeshBasicMaterial. Skipped — look-breaking, small gain.

### 5. Frame caching — NOT applicable
- No two consecutive frames are identical: the camera creeps every frame,
  characters blink, dust puffs animate. Remotion has no frame cache for
  this pipeline. Skipped.

## Expected speed (estimate — the Actions speed test measures the real number)
- Unoptimized Remotion on Actions measured **6.1 s/frame** (10-frame re-run
  2026-11-10 ~11:13 IST, run 42763866228, 61 s for 10 frames; first run 6.8).
  Full 1,254-frame render on 20 jobs ≈ 10–12 min wall (incl. npm ci + browser
  install). Local PostDriver stills measure ~160–200 s/frame on this VM.
- Model: fragment-bound work drops ~4x (quarter pixels); lens+bloom
  (~40–50% of frame cost) removed. Fixed per-frame costs remain (4096x4096
  shadow map, character canvas textures, React/world update).
- **Expected: ~1.5–3 s/frame on Actions** (vs 6.1 unoptimized), i.e. the
  full 1,254-frame render across 20 jobs ≈ 63 frames/job × ~2 s ≈ **2–4 min
  wall time** (vs ~10–12 min unoptimized). The 10-frame speed test decides.

## KNOWN upstream defect to watch for in the speed test (NOT from this optimization)
- The UNOPTIMIZED project's re-run (run 42763866228) showed frame 0 good
  but **frames 1–9 with a TILING defect** (mountain/sky repeats 5x vertically
  + vertical seam) — the full unoptimized render is BLOCKED until a fix
  subagent resolves it (spawned 2026-11-10 ~11:40 IST). The optimized
  speed-test clip (frames 0–9) MUST be checked frame-by-frame for the same
  defect; if present, report it and stop — do not assume the optimization
  caused it (local stills f12/f200/f350 show no tiling).
- The 26 Kenney GLBs are missing from BOTH projects (world.ts `loadKit`
  tolerates it; props silently dropped). A fix subagent is fetching the
  Kenney CC0 GLBs (2026-11-10 ~11:40 IST); when available, drop them into
  `public/bridge/kenney/` in both projects and rebuild the slim zips.

## Verification (local, this copy)
- `npx tsc --noEmit` passes.
- Stills rendered locally at scale 0.25 (buffer still 540x960), in
  `out/stills-opt/`, all visually checked 2026-11-10 ~06:04–06:21 IST:
  - `opt_12.jpg` (hook, 19,210 B) — Manjhi + hammer, green pagri, ink
    outlines, sky/cloud/boulders. Correct, not blank.
  - `opt_200.jpg` (village MS, 21,698 B) — Manjhi close-up, mountain slope
    + boulders, ink outlines. Correct, not blank.
  - `opt_350.jpg` (hammer CU, 21,447 B) — Manjhi + hammer, determined
    expression, rock face with ink lines. Correct, not blank.
  - `opt_1150.jpg` (payoff, 17,409 B) — road through the gap, golden
    sunset, fields/trees, purple rock faces with ink. Correct, not blank.
  - `opt_5.jpg` (23,202 B) — village wide, huts + trees + mountain face,
    single mountain/sky, **NO tiling** (the defect range in the unoptimized
    video render). Caveat: stills mode (`renderStill`) is not video mode
    (`remotion render`) — the speed-test clip must still be checked
    frame-by-frame for the defect (see the brief).
- Local per-frame times (f12 ~6 min incl. bundle, f200 ~4 min, f350 ~3 min,
  f1150 226.5 s, f5 250.1 s) are NOT meaningful: three stills scripts ran
  concurrently on a 1.5-CPU VM (load avg 3.5–6.6). No local speedup ratio
  is claimed. The real number comes from the Actions speed test.
- The full render goes to GitHub Actions (repo `manjhi-3d-optimized-render`,
  workflows in `.github/workflows/`); run the 10-frame speed test FIRST.
