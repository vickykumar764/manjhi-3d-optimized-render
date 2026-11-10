// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so villagers in step share canvases (7 head shapes x outfits).
// Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, MANJHI, MANJHI_OLD, WIFE, villager, fxBurst, fxStars, fxPuff, fxContact, fxShadow,
  Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import { FPS, D0, SHOTS, HITS, hammerK, FALL_T0, FALL_T1, WIFE_LEDGE, WIFE_GROUND, GAP_AT, MANJHI_AT, manjhiState, ManjhiState, V3, ridgeY,
  smooth, clamp01,
} from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
/** head-shape seed: 7 shapes, so villagers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- crowd by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };

const MANJHI_WHO = (old: boolean, i = 1): Who => ({ i, o: old ? MANJHI_OLD : MANJHI, okey: old ? "manjhi_old" : "manjhi" });

/** hammer strike burst + dust puff at the rock face, right after each hit */
const strikeFx = (t: number, out: Stage) => {
  for (const th of HITS) {
    if (t >= th && t < th + 5 / FPS) {
      const u = (t - th) / (5 / FPS);
      out.fx.push({ key: `burst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: GAP_AT[0], y: GAP_AT[1] + 0.3, z: GAP_AT[2] + 0.4, w: 0.9, h: 0.9 });
    }
  }
  let last = -1;
  for (const th of HITS) if (th <= t) last = th;
  const dt = t - last;
  if (last >= 0 && dt < 0.5) {
    const u = q(dt / 0.5, 30);
    out.fx.push({ key: `puff${u}`, cw: 400, ch: 400, draw: (p) => fxPuff(p, u), x: GAP_AT[0], y: GAP_AT[1] + 0.2, z: GAP_AT[2] + 0.5, w: 1.1, h: 1.1, soft: true });
  }
};

type ManjhiOpts = {
  old?: boolean; expr?: Expr; x?: number; y?: number; z?: number; dir?: [number, number]; hammer?: boolean;
  mode?: "stand" | "march" | "sit"; phase?: number; wave?: number; headTilt?: number; scale?: number; swaps?: number[];
};
/** Manjhi himself, placed and posed; the hammer prop animates with hammerK(t) in both front and side views */
const manjhiPlace = (cam: CamInfo, t: number, out: Stage, o: ManjhiOpts = {}) => {
  const { old = false, expr = "stern", x = MANJHI_AT[0], y = D0, z = MANJHI_AT[2], dir = [0, 1] as [number, number],
    hammer = false, mode = "stand", phase = 0, wave, headTilt = 0, scale = 1, swaps = [] } = o;
  const who = MANJHI_WHO(old);
  const k = q(hammerK(t), 30);
  const view = viewOf(cam, x, z, dir[0], dir[1]);
  const blink = lidAt(t, 1, swaps);
  const fo: FrontOpts = { mode, expr, blink, phase, wave, headTilt, facing: 0, ...(hammer ? { prop: ["hammer", k] as const } : {}) };
  const so: SideOpts = { mode: mode === "sit" ? "stand" : mode, expr, blink, phase, ...(hammer ? { prop: ["hammer", k] as const } : {}) };
  out.places.push(person(cam, who, x, y, z, view, fo, so, scale));
  blob(out, x, y, z, scale);
  if (hammer) strikeFx(t, out);
};

/** villagers standing around, facing the mountain (+z); laughing ones hop a little */
const villagersAt = (cam: CamInfo, t: number, out: Stage, spots: [number, number][], expr: (i: number) => Expr, laugh: boolean) => {
  spots.forEach(([x, z], i) => {
    const who: Who = { i: i + 10, o: villager(i), okey: `v${i % 6}` };
    const e = expr(i);
    const hop = laugh && e === "laugh" ? Math.max(0, Math.sin(t * 7 + i)) * 0.1 : 0;
    const view = viewOf(cam, x, z, 0, 1);
    const blink = lidAt(t, i + 10);
    out.places.push(person(cam, who, x, D0 + hop, z, view,
      { mode: "stand", expr: e, blink }, { mode: "stand", expr: e, blink }));
    blob(out, x, D0, z, 1, hop > 0 ? 0.6 : 1);
  });
};

// shot 2: the village in 1960; Manjhi appears from the second key, standing before the mountain
const villageShot = (cam: CamInfo, t: number, out: Stage) => {
  // on the lane between the hut rows (z -51..-54): the old spots (z -47..-49) stood INSIDE the row-1 huts
  const spots: [number, number][] = [[-14, -52], [-6, -53], [4, -51], [12, -53], [-20, -52], [8, -51], [18, -53], [-2, -52]];
  villagersAt(cam, t, out, spots, (i) => (i % 2 ? "smile" : "neutral"), false);
  if (t >= 181 / FPS) manjhiPlace(cam, t, out, { expr: "stern", dir: [0, 1] });
};

// shot 3: Manjhi climbs the slope path, then hammers at the gap
const climbShot = (cam: CamInfo, t: number, out: Stage) => {
  const f = t * FPS;
  if (f < 333) {
    const u = clamp01((f - 302) / 31);
    const x = -14 + 6 * u, z = -14 + 0.3 * u;
    manjhiPlace(cam, t, out, { expr: "stern", x, y: ridgeY(z), z, dir: [1, 0.1], mode: "march", phase: (t * 2) % 1 });
  } else {
    manjhiPlace(cam, t, out, { expr: "stern", hammer: true });
  }
};

// shot 4: the village laughs at him
const laughShot = (cam: CamInfo, t: number, out: Stage) => {
  // north of the row-1 huts (z -43.5..-45), facing the mountain/camera: the old spots (z -47..-50) were inside the huts
  const spots: [number, number][] = [[-5, -44], [-3, -45], [-1, -43.5], [1, -44.5], [3, -44], [5, -43.5], [-4, -44.5], [2, -43.5], [0, -44]];
  villagersAt(cam, t, out, spots, (i) => (i % 3 === 0 ? "grin" : "laugh"), true);
};

// shot 7 (flashback, golden): his wife stands on the slope path, slips, and falls to the foot of the slope
const fallShot = (cam: CamInfo, t: number, out: Stage) => {
  const [lx, ly, lz] = WIFE_LEDGE, [gx, , gz] = WIFE_GROUND;
  const wife: Who = { i: 50, o: WIFE, okey: "wife" };
  if (t < FALL_T0) {
    const view = viewOf(cam, lx, lz, 0, -1);
    out.places.push(person(cam, wife, lx, ly, lz, view,
      { mode: "stand", expr: "neutral", blink: lidAt(t, 50) }, { mode: "stand", expr: "neutral", blink: lidAt(t, 50) }));
    blob(out, lx, ly, lz, 0.9);
  } else if (t < FALL_T1) {
    const u = (t - FALL_T0) / (FALL_T1 - FALL_T0);
    const x = lx + (gx - lx) * u, z = lz + (gz - lz) * u;
    const y = ly + (D0 - ly) * u * u + 1.2 * u * (1 - u); // drops fast, slight arc
    const view = viewOf(cam, x, z, 0, -1);
    out.places.push(person(cam, wife, x, y, z, view,
      { mode: "fall", expr: "shock", blink: 0 }, { mode: "stand", expr: "shock", blink: 0 }));
  } else {
    // slumped at the foot of the slope
    const view = viewOf(cam, gx, gz, 0, -1);
    out.places.push(person(cam, wife, gx, D0, gz, view,
      { mode: "sit", expr: "dazed", blink: 0 }, { mode: "stand", expr: "dazed", blink: 0 }));
    blob(out, gx, D0, gz, 0.9, 0.8);
    const u = clamp01((t - FALL_T1) / 0.8);
    if (u < 1) {
      out.fx.push({ key: `stars${q(u, 30)}`, cw: 420, ch: 210, draw: (p) => fxStars(p, q(u, 30)), x: gx, y: D0 + 1.5, z: gz, w: 0.75, h: 0.375 });
      out.fx.push({ key: `puff${q(u, 30)}`, cw: 400, ch: 400, draw: (p) => fxPuff(p, q(u, 30)), x: gx, y: D0 + 0.3, z: gz, w: 1.2, h: 1.2, soft: true });
    }
  }
};

// shot 8 (golden): the long road around the mountain, his wife on his back
const roadShot = (cam: CamInfo, t: number, out: Stage) => {
  const f = t * FPS, u = clamp01((f - 799) / 83);
  const x = 66 + 4.5 * u, z = -39 + 1.5 * u;
  const dir: [number, number] = [0.95, 0.32];
  const phase = (t * 2) % 1;
  const view = viewOf(cam, x, z, dir[0], dir[1]);
  const who = MANJHI_WHO(true);
  const blink = lidAt(t, 1);
  out.places.push(person(cam, who, x, D0, z, view,
    { mode: "march", expr: "stern", phase, blink },
    { mode: "march", expr: "stern", phase, blink, stride: 0.9 }));
  // his wife on his back: seated card at shoulder height, just behind him (reads as a piggyback)
  const wx = x - dir[0] * 0.35, wz = z - dir[1] * 0.35;
  out.places.push(person(cam, { i: 50, o: WIFE, okey: "wife" }, wx, D0 + 0.95, wz, view,
    { mode: "sit", expr: "dazed", blink: 0 }, { mode: "stand", expr: "dazed", blink: 0 }, 0.72));
  blob(out, x, D0, z);
};

// shot 9 (golden): she could not be saved — Manjhi kneels, his wife lying in front of him
const kneelShot = (cam: CamInfo, t: number, out: Stage) => {
  manjhiPlace(cam, t, out, { old: true, expr: "pained", x: -7, z: -16, dir: [0, -1], mode: "sit", headTilt: 0.18 });
  // his wife lies directly in front of him (south, toward the village/camera)
  const view = viewOf(cam, -7, -18.3, 0, -1);
  out.places.push(person(cam, { i: 50, o: WIFE, okey: "wife" }, -7, D0, -18.3, view,
    { mode: "sit", expr: "neutral", blink: 0 }, { mode: "stand", expr: "neutral", blink: 0 }, 0.9));
  blob(out, -7, D0, -18.3, 0.9, 0.8);
};

// shot 10: 22 years later — the breakthrough blow at 33.83 s
const breakShot = (cam: CamInfo, t: number, out: Stage) => {
  const expr: Expr = t < 34.2 ? "grin" : "laugh";
  manjhiPlace(cam, t, out, { old: true, expr, hammer: true });
  if (t >= 33.83 && t < 33.83 + 0.45) {
    const u = (t - 33.83) / 0.45;
    out.fx.push({ key: `bigburst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: GAP_AT[0], y: GAP_AT[1] + 0.4, z: GAP_AT[2] + 0.4, w: 1.6, h: 1.6 });
  }
};

// shot 11: the road through — villagers walk the new road, Manjhi stands in the gap
const walkShot = (cam: CamInfo, t: number, out: Stage) => {
  const f = t * FPS, u = clamp01((f - 1045) / 75);
  for (let i = 0; i < 6; i++) {
    const x = -3 + i * 1.2 + (hh(i, 3) - 0.5) * 0.5;
    const z = -14 + 30 * clamp01(u + (hh(i, 4) - 0.5) * 0.2);
    const view = viewOf(cam, x, z, 0, 1);
    const who: Who = { i: i + 10, o: villager(i + 2), okey: `v${(i + 2) % 6}` };
    const phase = (t * 2 + hh(i, 5)) % 1;
    const blink = lidAt(t, i + 10);
    out.places.push(person(cam, who, x, D0, z, view,
      { mode: "march", expr: "smile", phase, blink },
      { mode: "march", expr: "smile", phase, blink, stride: 0.9 }));
    blob(out, x, D0, z);
  }
  manjhiPlace(cam, t, out, { old: true, expr: "grin", dir: [0, 1] });
};

// shot 12 (golden): payoff — old Manjhi in the gap, facing the camera, waving
const payoffShot = (cam: CamInfo, t: number, out: Stage) => {
  manjhiPlace(cam, t, out, { old: true, expr: "grin", dir: [0, -1], wave: q(Math.sin(t * 2.2), 30) });
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, b: ManjhiState, cam: CamInfo): Stage => {
  void b; // the world reads gap/cut/shake/fallen itself; the cast reads the same values from story.ts
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  switch (s.crowd) {
    case "hammer": manjhiPlace(cam, t, out, { expr: "stern", hammer: true }); break;
    case "village": villageShot(cam, t, out); break;
    case "climb": climbShot(cam, t, out); break;
    case "laugh": laughShot(cam, t, out); break;
    case "years": manjhiPlace(cam, t, out, { old: true, expr: "stern", hammer: true }); break;
    case "crack": manjhiPlace(cam, t, out, { old: true, expr: "grin", hammer: true, swaps: [19.48, 20.6] }); break;
    case "fall": fallShot(cam, t, out); break;
    case "road": roadShot(cam, t, out); break;
    case "kneel": kneelShot(cam, t, out); break;
    case "break": breakShot(cam, t, out); break;
    case "walk": walkShot(cam, t, out); break;
    case "payoff": payoffShot(cam, t, out); break;
    default: break;
  }
  return out;
};

export { FPS };
