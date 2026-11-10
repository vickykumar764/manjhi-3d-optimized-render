// Timeline of the Manjhi short: 12 shots timed to the Hindi voice (audio/words.json),
// 41.796 s = 1254 frames at 30 fps. Story: Dashrath Manjhi, the Mountain Man of Bihar —
// one man, a hammer and a chisel, 22 years, one mountain cut through.
// Camera grammar (from the bridge skill): continuous slow push-ins; symmetric smootherstep glides
// 18-40 f; big reframes are cuts; hammer impacts are 7-frame kicks that flip sign every frame;
// no hand-held float. Every visual reaction lands 0-3 frames before its word.
export const FPS = 30;
export const TOTAL = 1254;
export const D0 = 6.0; // ground height (m) — characters stand at y = D0
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// ---------------- story physics ----------------
// The cut through the mountain (gap width in metres) as a function of film time t (seconds).
// It is 0 until the years pass (shot 5), widens as he works, and opens fully at the breakthrough (shot 10).
export const gapW = (t: number) => lin([[0, 0], [15.3, 0], [19.4, 2.5], [22.3, 4.0], [31.7, 4.0], [34.0, 9.0], [41.8, 9.0]], t);
// How much of the mountain has been cut away (0 = intact face, 1 = road through), for dust/rock FX.
export const cutU = (t: number) => clamp01((gapW(t) - 0) / 9);
// Wife's fall (shot 7, flashback): she slips from the slope path at t = 23.9 s and lands at 24.6 s.
export const FALL_T0 = 23.9, FALL_T1 = 24.6;
export const WIFE_LEDGE: V3 = [-10, D0 + 14, -14]; // where she stands on the slope path (south face)
export const WIFE_GROUND: V3 = [-8, D0, -17]; // where she lands, at the foot of the slope

// Hammer strike times (seconds) — the strikes the picture and the sound are timed to.
export const HITS = [1.0, 1.83, 2.67, 3.5, 10.33, 10.93, 11.53, 12.13, 15.9, 17.5, 19.0, 32.5, 33.17, 33.83];
/** 0 = hammer raised, 1 = struck. 4 f wind-up, held ~7 f at the top, a 1-frame strike on the word. */
export const hammerK = (t: number) => {
  let k = 1;
  for (const th of HITS) {
    const n = (t - th) * FPS;
    if (n >= -11 && n < -7) k = Math.min(k, 1 - smooth((n + 11) / 4));
    else if (n >= -7 && n < 0) k = 0;
  }
  return k;
};

export type ManjhiState = { gap: number; cut: number; shake: number; fallen: boolean };
export const manjhiState = (id: number, t: number): ManjhiState => ({
  gap: gapW(t), cut: cutU(t), shake: id === 10 && t > 33.8 ? 1 : 0, fallen: t >= FALL_T1,
});

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type Crowd = "hammer" | "village" | "climb" | "laugh" | "years" | "crack" | "fall" | "road" | "kneel" | "break" | "walk" | "payoff" | "none";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: Crowd; tau: (t: number) => number };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 112, light: "day", crowd: "hammer", tau: (t) => t },      // hook: one man broke a mountain with a hammer
  { id: 2, a: 112, b: 302, light: "day", crowd: "village", tau: (t) => t },   // 1960, Bihar, poor labourer Dashrath Manjhi
  { id: 3, a: 302, b: 377, light: "day", crowd: "climb", tau: (t) => t },     // every day he climbed and struck
  { id: 4, a: 377, b: 460, light: "day", crowd: "laugh", tau: (t) => t },     // the village laughed, called him mad
  { id: 5, a: 460, b: 583, light: "day", crowd: "years", tau: (t) => t },     // one year became five, five became twenty
  { id: 6, a: 583, b: 670, light: "day", crowd: "crack", tau: (t) => t },     // the mountain did not strike back; it was losing
  { id: 7, a: 670, b: 799, light: "golden", crowd: "fall", tau: (t) => t },   // flashback: his wife fell from the hill
  { id: 8, a: 799, b: 882, light: "golden", crowd: "road", tau: (t) => t },   // 55 km around to find a doctor
  { id: 9, a: 882, b: 951, light: "golden", crowd: "kneel", tau: (t) => t },  // she could not be saved
  { id: 10, a: 951, b: 1045, light: "day", crowd: "break", tau: (t) => t },   // 22 years later, he broke the mountain
  { id: 11, a: 1045, b: 1120, light: "day", crowd: "walk", tau: (t) => t },   // 55 km is now 15
  { id: 12, a: 1120, b: TOTAL, light: "golden", crowd: "payoff", tau: (t) => t }, // he could not carry her over it, so he moved it
];
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 2: 8, 7: 8, 9: 6, 10: 6, 12: 8 };
export const FLASH_AT = 110;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
/** layers to draw at frame f: base shot, plus the next shot fading in during a crossfade */
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
/** symmetric smootherstep (attack = release, ~10 f each on a 23 f move) */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
/** push-in factor since f0: the subject grows ~rate per frame; `punch` raises it (with 8 f soft edges) for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
/** dolly push: camera slides toward the look point by factor k */
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
/** zoom push (camera stays put): tan(fov/2) shrinks by k */
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
/** a roll-only move on top of an existing framing */
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });

// Mountain profile (shared with world.ts and cast.ts): y(z) = D0 + PEAK * (1 - (|z| / HALF_W) ^ 1.6).
// At z = -14 the surface is D0+14 (the wife's slope path), at z = -17.5 it is ~D0+2 (where Manjhi hammers).
export const PEAK = 42, HALF_W = 18;
export const ridgeY = (z: number) => D0 + PEAK * (1 - Math.pow(Math.min(1, Math.abs(z) / HALF_W), 1.6));

// Mountain geometry anchors (world.ts builds the ridge along x at z = 0, peak ~D0+42)
export const GAP_AT: V3 = [0, D0 + 1.0, -17.5]; // the rock face where Manjhi hammers (south face base)
export const MANJHI_AT: V3 = [0, D0, -19.5]; // where Manjhi stands to hammer, facing north (+z)
export const VILLAGE_AT: V3 = [0, D0, -52]; // village centre
export const ROAD_END: V3 = [0, D0, 30]; // far side of the cut road

// ---- framings (f -> camera); each pushes in from the frame its key starts ----
// shot 1 (hook): wide mountain vista -> MS of Manjhi hammering -> hammer CU
// (hammering cameras sit EAST of him looking west: he faces the rock (screen-left) in side profile)
const S1a = (f: number) => dolly([26, D0 + 16, -95], [0, D0 + 9, -2], pushK(f, 0, 0.0025), { fov: 50 }); // hook wide: whole ridge + sky above + base/ground below, Manjhi visible at the foot
const S1b = (f: number) => dolly([4.5, D0 + 1.6, -19.5], [0, D0 + 1.2, -19.5], pushK(f, 12, 0.002), { fov: 40, roll: -0.04 });
const S1c = (f: number) => dolly([2.6, D0 + 1.3, -19], [0, D0 + 0.9, -18.2], pushK(f, 72, 0.003), { fov: 34, roll: 0.04 });
// shot 2 (village, 1960): village wide -> Manjhi before the mountain -> closer, punch on "chunauti"
const S2a = (f: number) => zoom([25, D0 + 12, -78], [0, D0 + 4, -45], 44, pushK(f, 112, 0.002));
const S2b = (f: number) => dolly([5, D0 + 2, -20], [0, D0 + 1.8, -19.5], pushK(f, 181, 0.002), { fov: 40 });
const S2c = (f: number) => dolly([3, D0 + 1.9, -19.5], [0, D0 + 1.9, -19.5], pushK(f, 237, 0.0015, 0.006, 35), { fov: 36 });
// shot 3 (climb + hammer): slope path -> hammering CU
const S3a = (f: number) => dolly([8, D0 + 10, -28], [-8, D0 + 14, -13], pushK(f, 302, 0.002), { fov: 42 });
const S3b = (f: number) => dolly([4.2, D0 + 1.6, -20.2], [0, D0 + 1.0, -19.3], pushK(f, 333, 0.0018), { fov: 38 }); // hammer CU: loosened — at fov 36 he filled the frame and his feet were cut
// shot 4 (villagers laugh): group MS -> closer laughing faces (roll)
// (cameras sit NORTH of the group looking south: the villagers face the mountain, i.e. toward the lens)
const S4a = (f: number) => dolly([6, D0 + 2.5, -38], [0, D0 + 1.5, -44.5], pushK(f, 377, 0.002), { fov: 40 }); // villagers stand north of the huts now (old spots were inside the hut row)
const S4b = (f: number) => dolly([3, D0 + 2, -40], [0, D0 + 1.6, -44.5], pushK(f, 410, 0.002), { fov: 36, roll: 0.04 });
// shot 5 (years pass): same framing as S1b, notch wider, Manjhi older -> wider showing the notch
const S5a = (f: number) => dolly([4.5, D0 + 1.6, -19.5], [0, D0 + 1.2, -19.5], pushK(f, 460, 0.002), { fov: 40 });
const S5b = (f: number) => dolly([10, D0 + 6, -32], [0, D0 + 8, 0], pushK(f, 520, 0.002), { fov: 44 });
// shot 6 (mountain losing): crack CU -> rock chips + Manjhi grin
const S6a = (f: number) => dolly([5.5, D0 + 2.2, -26], [0, D0 + 1.3, -18.5], pushK(f, 583, 0.0025, 0.006, 35), { fov: 34 }); // crack CU from the south, pulled back: the look sits BETWEEN Manjhi (z -19.5) and the crack (z -17.6) so both are in frame
const S6b = (f: number) => dolly([4, D0 + 1.5, -19.5], [0, D0 + 1.2, -19.5], pushK(f, 625, 0.002), { fov: 38 });
// shot 7 (flashback, golden): wife on the slope path -> the fall
const S7a = (f: number) => dolly([10, D0 + 18, -32], [-9, D0 + 13, -13], pushK(f, 670, 0.0016), { fov: 42 }); // pulled back: the path band filled the frame
const S7b = (f: number) => dolly([3, D0 + 8, -24], [-8, D0 + 8, -14], pushK(f, 730, 0.002), { fov: 38, roll: -0.03 });
// shot 8 (the long road, golden): wide winding path -> TRACKING CU on Manjhi carrying his wife
// (the old static S8b left him 22 m away, ~11% of the frame; the camera now walks with him)
const S8a = (f: number) => dolly([30, D0 + 15, -60], [75, D0 + 2, -35], pushK(f, 799, 0.0016), { fov: 46 });
const S8b = (f: number) => {
  const u = clamp01((f - 799) / 83), x = 66 + 4.5 * u, z = -39 + 1.5 * u; // same walk line as roadShot
  return dolly([x - 7, D0 + 2.2, z - 5], [x, D0 + 1.2, z], pushK(f, 840, 0.0015), { fov: 40 });
};
// shot 9 (she could not be saved): quiet CU, Manjhi kneeling -> closer on his face
// (he kneels facing SOUTH toward the village/camera, his wife lying in front of him)
const S9a = (f: number) => dolly([-3, D0 + 1.5, -24], [-7, D0 + 0.7, -17.5], pushK(f, 882, 0.002), { fov: 36 }); // both Manjhi and his wife in frame
const S9b = (f: number) => dolly([-4, D0 + 1.3, -22], [-7, D0 + 0.9, -17], pushK(f, 915, 0.0018), { fov: 34 });
// shot 10 (breakthrough): wide, the gap splitting -> Manjhi in the gap, dust
const S10a = (f: number) => dolly([12, D0 + 8, -32], [0, D0 + 10, 0], pushK(f, 951, 0.0025), { fov: 44 });
const S10b = (f: number) => dolly([3, D0 + 2, -24], [0, D0 + 1.0, -19.5], pushK(f, 1000, 0.002), { fov: 40 }); // from the south, clear of the cap face (old spot was jammed against it and cut Manjhi off)
// shot 11 (road through): road + walkers -> closer on the walkers
const S11a = (f: number) => dolly([8, D0 + 5, -28], [0, D0 + 3, 5], pushK(f, 1045, 0.002), { fov: 44 });
const S11b = (f: number) => dolly([5, D0 + 2, 0], [0, D0 + 1.8, 0], pushK(f, 1085, 0.002), { fov: 40 });
// shot 12 (payoff, golden): Manjhi in the gap -> crane out to the sunset wide
const S12a = (f: number) => dolly([16, D0 + 11, -36], [0, D0 + 9, 5], pushK(f, 1120, 0.0016), { fov: 44 }); // look lowered so the slope path sits near the top edge, not as a beam across the frame
const S12b = (f: number) => dolly([20, D0 + 14, -48], [0, D0 + 10, 10], pushK(f, 1185, 0.0016), { fov: 46 });

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: S1a },
    { f: 12, dur: 37, cut: true, s: S1b }, // hook wide is 12 f only, then CUT to Manjhi on "एक आदमी"
    { f: 72, dur: 32, s: S1c },
  ],
  2: [
    { f: 112, s: S2a },
    { f: 181, dur: 18, cut: true, s: S2b },
    { f: 237, dur: 18, s: S2c },
  ],
  3: [
    { f: 302, s: S3a },
    { f: 333, dur: 40, cut: true, s: S3b }, // cut hides the climb -> base teleport
  ],
  4: [
    { f: 377, s: S4a },
    { f: 410, dur: 18, s: S4b },
  ],
  5: [
    { f: 460, s: S5a },
    { f: 520, dur: 24, s: S5b },
  ],
  6: [
    { f: 583, s: S6a },
    { f: 625, dur: 20, s: S6b },
  ],
  7: [
    { f: 670, s: S7a },
    { f: 730, cut: true, s: S7b },
  ],
  8: [
    { f: 799, s: S8a },
    { f: 840, dur: 24, cut: true, s: S8b }, // wide aerial -> CU on the carry: a cut, not a fly-through
  ],
  9: [
    { f: 882, s: S9a },
    { f: 915, dur: 20, s: S9b },
  ],
  10: [
    { f: 951, s: S10a },
    { f: 1000, cut: true, s: S10b },
  ],
  11: [
    { f: 1045, s: S11a },
    { f: 1085, dur: 20, cut: true, s: S11b }, // road wide -> walkers CU: a cut
  ],
  12: [
    { f: 1120, s: S12a },
    { f: 1185, dur: 40, s: S12b },
  ],
};

// impact kicks: the image offset flips sign every frame (~3 px at 720p per unit), decays to 0 in
// 7 f, roll +-0.23 deg per unit; they start on the first frame at/after the event.
const KICKS: [number, number][] = [
  ...HITS.map((t): [number, number] => [t, 0.5]),
  [33.83, 1.6], // the breakthrough blow
  [34.17, 1.2], // the crack runs through the ridge
];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(f / FPS);
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
/** frame at which the current key's move has finished (for picking billboard views per key, not per frame) */
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens: depth of field + foreground framing ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const eyesGap = (f: number): V3 => [0, D0 + 1.6, -19.5];
const crackPt = (f: number): V3 => [0, D0 + 1.3, -18.5]; // between Manjhi (z -19.5) and the crack (z -17.6)
const wifePt = (f: number): V3 => [-9, D0 + 12, -13];
const kneelPt = (f: number): V3 => [-6.8, D0 + 1.0, -17];
export const DOF: Dof[] = [
  { f: 0, cInf: 0 }, // hook wide: mountain sharp
  { f: 12, dur: 37, cInf: 10, focus: eyesGap }, // MS Manjhi hammering (cut at f12)
  { f: 72, dur: 32, cInf: 10, focus: eyesGap }, // hammer CU
  { f: 112, cInf: 0 }, // village wide
  { f: 181, dur: 18, cInf: 10, focus: eyesGap }, // Manjhi before the mountain
  { f: 237, dur: 18, cInf: 10, focus: eyesGap }, // closer, "chunauti"
  { f: 302, cInf: 0 }, // slope path wide
  { f: 333, dur: 40, cInf: 10, focus: eyesGap }, // hammering CU
  { f: 377, cInf: 10, focus: () => [0, D0 + 1.6, -44.5] }, // villagers MS (group stands north of the huts)
  { f: 410, dur: 18, cInf: 10, focus: () => [0, D0 + 1.6, -44.5] }, // laughing faces
  { f: 460, cInf: 10, focus: eyesGap }, // years: Manjhi older at the gap
  { f: 520, cInf: 0 }, // notch wide
  { f: 583, cInf: 10, focus: crackPt }, // crack CU
  { f: 625, cInf: 10, focus: eyesGap }, // Manjhi grin
  { f: 670, cInf: 5 }, // flashback wide, mild
  { f: 730, cInf: 10, focus: wifePt }, // the fall
  { f: 799, cInf: 0 }, // long road wide
  { f: 840, cInf: 10, focus: (f) => { const u = clamp01((f - 799) / 83); return [66 + 4.5 * u, D0 + 1.5, -39 + 1.5 * u]; } }, // carrying his wife (tracking focus)
  { f: 882, cInf: 10, focus: kneelPt }, // kneeling CU
  { f: 915, cInf: 10, focus: kneelPt }, // his face
  { f: 951, cInf: 0 }, // breakthrough wide
  { f: 1000, cInf: 10, focus: eyesGap }, // Manjhi in the gap
  { f: 1045, cInf: 0 }, // road wide
  { f: 1085, cInf: 10, focus: () => [0, D0 + 1.8, 0] }, // walkers
  { f: 1120, cInf: 5 }, // payoff golden wide
  { f: 1185, cInf: 0 }, // crane out
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
/** what the lens focuses on (DOF): the DOF table's focus point, else the camera look point */
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing objects: visible while a <= f < b; kit = a GLB name accepted by build.ts prop() */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  // Manjhi kneeling (shot 9): a bush in the bottom-left corner, clear of his face
  { a: 882, b: 951, kit: "plant_bushDetailed", pos: [-2, D0, -20.5], s: 1.0, yaw: 0.4 },
  // payoff (shot 12): a bush bottom-left under the ridge
  { a: 1120, b: TOTAL, kit: "plant_bushDetailed", pos: [-4.5, D0, -24], s: 1.2, yaw: 0.4 },
];
