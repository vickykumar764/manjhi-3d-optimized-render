# Video-report findings — incorporated (2026-11-10)

Source: https://youtu.be/OtbLL6OBNE4 — Mr omi, "How to Make Viral Animated Shorts Using Claude (Full Workflow)",
11:52, published 1 Nov 2026, 867K views. Watched fully twice by the parent agent (visuals + audio,
human-style). **Correction: Manjhi is NOT in the video** — the demo short is the 1831 Broughton bridge
(74 soldiers march across, bridge collapses). Manjhi is a NEW application of the same method, which is
already this build's assignment — no change to the plan. The reference channel is Rick's Clips (the
same channel studied for the Hindi Ancient Jar remake). Demo-story facts: 12 April 1831, 60th Rifle
Corps, 74 men four abreast, no one killed, 20 injured, river only 2 feet deep — the joke
"Luckily, the river was only 2 feet deep. Unluckily, the river was only 2 feet deep."

## 1. Style-bible compliance (measured, not claimed)

| Bible number | Target | Manjhi measured | Verdict |
|---|---|---|---|
| Format | 1080x1920 vertical, 30 fps | 1080x1920, 30 fps | ✓ |
| Duration | 31–78 s (median ~60 s) | 41.796 s (1,254 f) | ✓ |
| Voice pace | 3.5–4.1 words/s, one male narrator (median 3.7) | **2.63 words/s** (110 words / 41.796 s) | ✗ deviation — see note |
| Loudness | −14 LUFS | **−14.1 LUFS** (mix.wav) | ✓ |
| LRA | ~2.4 LU | **5.3 LU** | deviation — see note |
| Captions | one word at a time | **NONE** (our rule: no captions) | deliberate, per user |

**Words/s deviation (2.63 vs 3.5–4.1):** the voiceover is the REUSED Hindi Helio voice (user order:
"paste the existing voiceover in", do NOT regenerate). It is a deliberate, slow storytelling pace
(Hindi narration for all ages) — the script is 12 lines, 110 words. It cannot be fixed without
re-recording the voice, which the user forbade. Consequence: the video is calmer than a Rick's Clips
short; the pacing is carried by the visuals (a cut or camera move every shot, hammer strikes on the
beat) rather than by word rate. Not a defect to chase — flagged, not fixed.

**LRA deviation (5.3 vs ~2.4 LU):** the march score is intentionally dynamic — a dead stop through
the wife's fall (22.3–25.5 s, silence) and a forte breakthrough (32–34.8 s). The bible's 2.4 LU is
Rick's Clips' flatter mix. Our finished loudness still hits −14 LUFS and the user-approved mix level
(music −14 dB / SFX −10 dB vs voice) is kept. Not fixed.

## 2. Script formula — the 12 Hindi lines already follow it

| Formula beat | Manjhi line(s) |
|---|---|
| Hook = paradox stated as fact in sentence 1, no setup | L1 "भारत में एक आदमी ने हथौड़े से पहाड़ तोड़ दिया।" |
| Setting in 1–2 lines | L2 "उन्नीस सौ साठ में, बिहार के एक गरीब मज़दूर दशरथ मांझी ने पहाड़ को चुनौती दे दी।" |
| Escalation, 3–6 beats (mockery / doubt) | L3 daily hammering → L4 village laughs, calls him mad → L5 years pass (1→5→20) → L6 the mountain is losing |
| Pivot with "You see" (14 of 20 videos) | L7 "देखिए, यह तब शुरू हुआ जब उसकी पत्नी उस पहाड़ी से गिर गई।" — "देखिए" IS the Hindi "You see" |
| Ironic payoff in the last 1–2 sentences | L11 "पचपन किलोमीटर अब पंद्रह रह गया।" → L12 "वह उसे पहाड़ पार नहीं करा सका। तो उसने पहाड़ हिला दिया।" |
| Deadpan double line (cf. the bridge joke "Luckily… Unluckily…") | L11/L12 pair: the road shrinks 55→15 km, then the twist — he could not carry her across the mountain, so he moved the mountain |

No script change needed. The flashback (L7–L9) is the "You see" pivot, placed at 22.3 s — the
story's midpoint, exactly where the formula puts it.

## 3. Cheap-look diagnosis — checked against our stills

| Diagnosis item | Manjhi status (measured) |
|---|---|
| Ink lines on ~3/4 of edges | ✓ InkPass outlines world + characters; stills show ink on rock, huts, figures, props |
| Camera glides ~23 frames slow in/out (not 3-frame snaps) | ✓ Cameras creep 0.15–0.25 %/frame (pushK) with cuts only on big jumps; shot keys glide 18–40 f (skill's numbers) |
| No pure black anywhere | ✓ MEASURED on s_200/s_350 (PostDriver): **0 pure-black pixels** in 518,400; 16–31 near-black (<8) px = the #030303 ink lines |
| Sunset shadows purple, not brown | ✓ Golden shade is violet-blue (LIGHTS.golden, violet-blue shade); s_840/s_1150 show purple shadows |
| Bodies 3.5 heads tall, arms/legs thin | ✓ toon.ts: adults 3.5 head-heights, bean heads, stick limbs |
| Backgrounds blurry (lens blur) so the eye goes to the character | ✓ DOF on most shots (cInf 10 on close-ups, 0 on wides); backgrounds visibly soft in s_200/s_350/s_600 |
| Colours bold, long blue shadows | ✓ Saturated palette (green pagri, pink sari, orange sunset); s_840 shows Manjhi's long shadow |

## 4. Process tips (creator)

- "Don't ask Claude what it thinks. Make it measure. You can't recreate an opinion. You can
  recreate a number." — this build's method throughout: every look decision was a measured still
  (6 rounds, ~50 stills), every speed a timed run, every audio level a meter reading.
- "When you use a lot of agents, don't just split the jobs, split the files." — the project is
  already file-split (story/world/cast/toon/build/paint/lights/shade/ink/lensblur/grade + audio
  timeline/sfx/music/mix), one owner per file.

## 5. Missing-files audit of the skill zip (the top comment's warning — CONFIRMED)

Checked 2026-11-10 against `~/workspace/your_files/claude-animated-shorts/claude-animated-shorts-main/`:

| What | In the zip? | Impact on this build |
|---|---|---|
| SKILL.md, README.md, LICENSE | ✓ | — |
| references/STYLE_BIBLE.md, references/frames/ (38), references/sheets/ (20), references/reports/ (8: CONTEXT.md + 7) | ✓ | — |
| templates/bridge/ (13 .ts files: Bridge/story/world/cast/toon/build/paint/lights/shade/ink/lensblur/grade) | ✓ | — |
| templates/audio/ (8 .py + cues.md), templates/scripts/ (5 files) | ✓ | — |
| **Kenney GLB files (`public/bridge/kenney/*.glb`)** | ✗ **0 .glb files in the whole zip; no `public/` folder at all** | TOLERATED: loadKit() catches per-file failures; trees/bushes/hedges are code-drawn veg; only lantern/cart/stall/windmill/canoe/lily/flowers are absent — the Manjhi world does not use them. SKILL.md names the "Kenney CC0 kit" but gives no download link. (The author's own note says his public/ was ~1.3 GB — the zip ships none of it.) |
| **package.json / Remotion project scaffold (src/Root.tsx, src/index.ts, remotion.config.ts)** | ✗ **none** | WORKED AROUND: the project was scaffolded by hand and versions pinned (remotion 4.0.542, three 0.169.0, @react-three/fiber 8.18.0, @react-three/postprocessing 2.16.3, postprocessing 6.39.6). A fresh setup from the zip alone cannot `npm install` — SKILL.md step 4 assumes a Remotion project already exists ("copy templates/bridge/ … to src/videos/<name>/, register a new composition next to BridgeShort in src/Root.tsx"). |
| Version pinning | ✗ none in the zip | Consequence: the Ancient Jar build (fiber 9 + three 0.187) hit the blank-canvas bug that this build (fiber 8 + three 0.169) dodged in stills mode — see the PostDriver fix in Manjhi.tsx. |

Nothing else is absent. The zip is complete as a skill + template library; it is NOT a runnable
project, and the Kenney props must be sourced separately (kenney.nl, CC0) or done without, as here.
