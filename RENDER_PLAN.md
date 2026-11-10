# Manjhi 3D short — full-render plan (measured, 2026-11-10)

## Measured render speed (this VM, SwiftShader, 1080x1920)
Stills via `scripts/manjhi-stills.mjs` (renderStill, scale 0.5 output but a 1080x1920 composer buffer,
so these ARE full-res frame costs), seconds per frame:
- round 1: 68.2 (incl. ~40 s bundle), 62.1, 112.5, 108.2, 114.7, 128.6, 121.2, 111.2, 99.2, 77.0
- mean ex-bundle ≈ **100 s/frame** (range 62–129 s; village/golden shots slowest)
- full video = 1254 frames x ~100 s ≈ **35 hours on this VM — NOT feasible locally.**
- For comparison the light Playwright kit renderer measured 4.13 s/frame on GitHub Actions and 6.1 s/frame
  on Kaggle CPU. Remotion is ~25x slower per frame than the kit because of the post chain (ink pass +
  lens blur 2-pass + bloom 6 levels + grade, MSAA 4, all at 1080x1920 through React Three Fiber).
- **PostDriver update (2026-11-10):** after the blank-canvas fix (below), stills got SLOWER on this VM —
  f200 **197.7 s**, f350 **161.5 s** (vs ~100 s before, same frames). The PostDriver's priority-1 useFrame
  + HalfFloat composer costs roughly 1.6–2x the wrapper path locally. The Actions speed test must
  measure the POSTDRIVER cost, not the old wrapper cost — the old ~100 s/frame number is stale.
  Local full-video estimate with PostDriver: 1254 x ~180 s ≈ **63 hours — even less feasible locally.**

## PostDriver — the blank-canvas fix (APPLIED 2026-11-10, VERIFIED)
- The `<EffectComposer>` wrapper from @react-three/postprocessing creates its plain postprocessing
  composer inside a passive useEffect, but Remotion's advance() runs BEFORE a child's passive effects,
  so in render mode the frame renders with no composer present — **blank canvas, NO error**. The Ancient
  Jar build on the same stack hit exactly this (many blank ~3.8 KB stills). Proof and full detail:
  `~/workspace/your_files/ricks-clips-ancient-jar-hindi/work/blank-canvas-fix.md` (proof frame
  out/test-stills/ac100.jpg there).
- Our Manjhi stills happened to paint through the wrapper (fiber 8.18.0's wrapper evidently creates the
  composer early enough in still mode) — but the full `remotion render` path uses the same advance()
  mechanism, so the wrapper was NOT trusted for the final render.
- **Fix applied in Manjhi.tsx:** the wrapper is gone. A `PostDriver` component creates the plain
  postprocessing composer synchronously in useMemo (`new PPComposer(gl, { frameBufferType: HalfFloatType,
  multisampling: 4 })`) and drives it from a priority-1 useFrame calling `composer.render(delta)`.
  Pass order = the skill's chain: RenderPass -> InkPass -> LensBlur pre -> LensBlur main -> ONE merged
  EffectPass (bloom + NEUTRAL tone + grade), MSAA 4, HalfFloat. When all post toggles are off,
  PostDriver is not mounted and the default R3F render runs.
- **Verified:** `npx tsc --noEmit` passes; stills f200 (42,147 bytes) and f350 (51,011 bytes) — tens of
  KB, not ~3.8 KB blank. **f350 is PIXEL-IDENTICAL to the pre-fix round-4 frame** (same sha256
  5a5e53afa30ed6f42438686ed0aa0ba2f48b01276bf9445c6410d699865e789a) — the PostDriver reproduces the
  exact same image. **Do NOT use the `<EffectComposer>` wrapper in render mode in any project.**
- Consequence for the render: the workflows below render WITH the PostDriver code (it is in the repo
  tree). The speed test measures the PostDriver cost.

## Full-render route: GitHub Actions (NOT yet measured for Remotion)
- Repo: create a NEW public repo (e.g. `manjhi-3d-render`) — do NOT reuse payeng-render (different project).
  **Creating the repo + uploading + running the workflows needs the live browser — a subagent cannot do it.**
- Upload: the whole `~/workspace/manjhi-3d-short/` tree MINUS `node_modules/`, `out/`, `remotion-tmp`
  (package.json + package-lock.json pin remotion 4.0.542 / three 0.169.0; `npm ci` on the runner).
  `public/` has NO Kenney GLBs (missing from the skill zip; world tolerates it — trees/bushes are
  code-drawn veg; only lantern/cart/stall/windmill/canoe/lily/flowers are absent).
  **Workflow files cannot be pushed by a GitHub App token** (learned on payeng-render: GH006 + the
  `workflows: write` permission is invalid in YAML) — the two `.github/workflows/*.yml` files must be
  created via the web UI, exactly like render-test.yml/render.yml were on payeng-render.
- **Workflows are WRITTEN and in the tree (ready to paste into the web UI):**
  - `.github/workflows/render-speed-test.yml` — ONE job, `--frames=0-9`, prints RENDER_SECONDS and
    SECONDS_PER_FRAME, runs an ffmpeg signalstats blank check (YDIF must be > 0), uploads the 10-frame
    clip `speed-test-10` (retention 1 day). **RUN THIS FIRST.**
  - `.github/workflows/render.yml` — 20 parallel jobs (matrix shard 0–19), 63 frames/job (shard 19:
    1197–1253), each prints its SECONDS_PER_FRAME and uploads `part-N.mp4` (retention 1 day).
    Both workflows use Playwright Chromium explicitly (`--browser-executable`, the proven WebGL path)
    + `remotion browser ensure` as backup, `--gl swangle`, `REMOTION_TMP=$RUNNER_TEMP/remotion-tmp`.
- **Scaling rule (decided after the speed test):** if Actions measures ~30–50 s/frame, 20 jobs x 63
  frames finish in ~35–55 min wall time. If ~100 s/frame, ~1.75 h/job — still inside the 6 h job
  limit, no change needed. If >~200 s/frame, split further (40 shards x ~32 frames) before running.
  Do NOT run the full workflow before the speed test reports.
- Merge locally with `scripts/merge-parts.sh [parts-dir]` (executable): verifies all 20 parts exist ->
  ffmpeg concat (video only, no re-encode) -> mux audio/mix.wav (`-map 0:v:0 -map 1:a:0` REQUIRED,
  Remotion writes a silent audio track) -> ffprobe check -> `scripts/short_qa.py` (target -14 LUFS;
  mix.wav is already -14.1 LUFS). Output: `out/manjhi-3d/The-Mountain-Man-Hindi-3D.mp4`.
- **Kaggle (6.1 s/frame kit) and Colab (~15–17 s/frame) are FALLBACKS ONLY.** Actions does ~95% of
  the work. Do NOT waste build time setting up Kaggle/Colab unless Actions is blocked (e.g. the
  browser renders blank on Actions, or the speed test shows an unusable rate). If Actions is blocked,
  the fallback is Kaggle CPU with the same frame-range split (one notebook per range, `npx remotion
  render --frames=A-B --gl swangle`), merged the same way.

## Chromium flags that matter (learned the hard way)
- `gl: "swiftshader"` is WRONG in Remotion 4.0.542: it maps to the obsolete `--use-gl=swiftshader`
  (GL_VENDOR/GL_RENDERER = Disabled, three.js cannot create a context). Use **`--gl swangle`**
  (= `--use-gl=angle --use-angle=swiftshader`; probe-verified WEBGL_OK on this VM).
- `chromiumOptions.args` is NOT supported in 4.0.542 — custom args are silently dropped. Do not rely on it.
- The headless-shell build cannot create a WebGL context on this VM either; the stills script uses
  Playwright's full Chrome first (`~/.cache/ms-playwright/chromium-1254/...`). On Actions, `remotion
  browser ensure` downloads the headless shell — VERIFY the 10-frame test actually renders (not black).

## Audio (DONE)
- `audio/mix.wav` — 41.796 s, -14.1 LUFS integrated, true peak -1.20 dBTP, LRA 5.3 LU.
  Voice (reused Hindi Helio) + original Bb march ducked to -14 dB vs voice + synthesized SFX at -10 dB.
  Stems: stem_voice/music/sfx.wav. Cues: audio/cues.md (music map + 47 SFX cues).

## Look-check status (2026-11-10)
- Round 1 (10 stills): found + fixed — brick-wall rock texture (new rockHD facets), hook wide too tight
  (S1a recomposed, cut to S1b at f12), European village houses (new mud-hut hut()), golden light backlit
  into night (az 6 -> 155), crack boxes like planks (shrunk to 4 cm seams), boulders blocking S2b/S9a/S10b
  (moved), climb->base teleport visible mid-glide (cuts on S1b/S2b/S3b/S8b/S11b), DOF smear streaks
  (all close-up cInf -> 10), slope path reading as a brick band (flat dirt, narrower, darker).
- Round 2 (12 stills): found + fixed —
  * **Streaks: ROOT CAUSE FOUND.** A fan of black diagonal lines in every close-up. A/B tests proved:
    DOF off -> lines stay (sharper); ink off -> all but 2 faint lines vanish. Cause = the INK pass
    inking the ridge mesh's grid creases: 2.4 m noise on a 40x14 grid made normal jumps > 35 deg on
    nearly every cell, and the distant western ridge (fogged to sky colour) showed only its black
    wireframe. Fix: ridge grid 60x20, noise 2.4 -> 0.9 m. The 2 faint lines left with ink off are the
    cloud planes' texture edges in the main render (acceptable).
  * S3b look point too high -> Manjhi below the frame (only his hammer showed). S3b recomposed.
  * Villagers stood INSIDE the hut rows (laughShot + villageShot spots overlapped the huts at z -48):
    laugh spots moved north of the huts (z -43.5..-45), S4a/S4b pulled back, villageShot spots moved
    onto the lane (z -51..-54). Also the sight-line culler deleted ALL huts from the S2a wide —
    buildVillage now never culls huts (trees still culled).
  * S6a showed only the cap wall (cracks floated on flat grey): S6a reframed from the south.
  * S7a path band filled the frame: camera pulled back. S8b static CU left Manjhi 22 m away:
    S8b is now a TRACKING camera following roadShot (DOF focus tracks too).
  * S10b jammed against the cap face, Manjhi cut off at the edge: reframed from the south.
  * S12a path read as an orange beam: look lowered. Golden sun az 155 -> 225 (warm key on the south face).
  * M.dirt flat (cobble map read as brick path up close); dirt strip added under the shot-8 carry route.
- Round 3 (10 stills, ~14 min): verdict — village wide WORKS (huts + villagers on the lane), laugh shot
  WORKS (laughing villagers), S3b Manjhi in frame, S10b breakthrough WORKS (laughing Manjhi + crack +
  dust), S9 kneel WORKS, streaks reduced to 2-4 faint lines (ridge smoothing worked). Remaining issues,
  all fixed for round 4: golden az 225 made the flashback/road shots blue DUSK (reverted to 155);
  path colour #8a7a66 went maroon in shade (restored #a68c66); the path's underside read as a dark beam
  in shot 12 (material now FrontSide — the strip's winding already faces up, so the top stays visible
  and the underside is culled from below); S3b too tight (loosened to fov 38, camera back); S6a cut
  Manjhi off at the edge (look moved between him and the crack, camera back, DOF focus follows);
  the shot-8 road strip was invisible (same colour as the ground — now its own darker #8a6a42).
- Round 4 (9 stills, ~12 min): verdict — 8/9 PASS. S3b loosened (Manjhi head-to-feet in frame),
  S6a reframe works (Manjhi + thin crack seams + faceted face), golden az 155 back (warm sunset,
  no more blue dusk), S9 kneel and S10 breakthrough both pass. ONLY the slope-path beam remained
  (130/700/1150): root cause found — the ribbon followed ridgeY(z), so on the steep face its 0.6 m
  width became a 1.9 m tall tan beam. Fix (in code, not yet rendered): the path is now a flat
  CONTOUR ledge at constant y = ridgeY(-14)+0.15, and its material is FrontSide (underside culled
  from below). The shot-8 road strip only showed as stray inked edge lines (face z-fought at 0.02 m):
  raised to 0.06 m with its own darker dirt.
- Round 5 (4 stills: 130,700,840,1150, ~4.5 min): verdict — the beam is GONE. The path is now a flat
  contour ledge: in the village wide it is a faint dashed trail line on the rock; in the flashback the
  wife stands on a thin warm line; in the payoff it is a thin dashed line across the top third. The
  payoff (road through the gap, sunset, trees, field) reads beautifully. 840 still showed the road
  strip only as stray inked edge lines — root cause: quad()'s normal is (b-a)x(d-a) and the strip's
  corner order faced DOWN, so its top face was culled. Fix: corner order reversed (faces up now).
- Round 6 (1 still: 840, 67 s): the road strip NOW RENDERS — Manjhi walks on a distinct dark
  red-brown dirt road against the orange ground, carrying his wife, sunset behind.
- **LOOK CHECK COMPLETE (2026-11-10): all 12 key frames pass** — hook (f12/f30), village wide (f130),
  village MS (f200), hammer CU (f350), laugh (f420), crack CU (f600), flashback (f700), carry (f840),
  kneel (f900), breakthrough (f1000), payoff (f1150). Accepted minor issues: 2-4 faint streak lines
  in close-ups (cloud edges / ridge creases); the wife sits upright in the kneel shot (no lying pose
  in toon.ts); the piggyback is an approximation (wife as a "sit" card at shoulder height); the
  cap-edge ink line shows in some wides; the distant field reads as a blue band in shot 8.
- Audio is DONE: audio/mix.wav, 41.796 s, -14.1 LUFS (music -14 dB / SFX -10 dB vs voice).
- **PostDriver fix applied + verified (2026-11-10, see the section above):** Manjhi.tsx no longer uses
  the `<EffectComposer>` wrapper; f200 (42 KB) and f350 (51 KB, pixel-identical to the pre-fix frame)
  prove the PostDriver renders the same image. The old ~100 s/frame local speed is stale — PostDriver
  stills measure ~160–200 s/frame locally.
- **Video-report findings incorporated (2026-11-10):** see VIDEO_REPORT_NOTES.md — style-bible table
  (2.63 words/s vs bible 3.5–4.1 is a measured deviation from the reused voice, not fixable without
  re-recording; LRA 5.3 vs 2.4 LU is the march's intentional dynamics), script-formula mapping (all
  12 lines follow hook/setting/escalation/"देखिए" pivot/ironic payoff), cheap-look checks (0 pure-black
  pixels measured; ink, glides, purple sunset shadows, 3.5-head bodies, lens blur all ✓), and the
  missing-files audit (Kenney GLBs absent from the zip — tolerated; no package.json/scaffold — worked
  around by hand-pinning versions).
- **Full render NOT started** — workflows are written (see above); the 10-frame Actions speed test
  must run first, and creating the repo + running it needs the live browser (parent's step).
- NOTE: DOF costs ~30 s/frame (t_200 with DOF 0 took 42.5 s vs 73.6 s with DOF 10) — the lens blur
  is ~40% of the per-frame cost. If the full render is too slow, dropping lens blur is the first lever
  (but it is core to the skill's look — do not drop it without the user's say-so).
