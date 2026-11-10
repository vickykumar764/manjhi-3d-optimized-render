// The whole place as one three.js scene: sky, dry plain, village, the mountain ridge (two halves that
// slide apart as Manjhi cuts the gap), the cut road, the slope path, boulders, dust, clouds and the cast.
// update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { Batch, boxGeo, V, quad, lam, buildVillage, Kit, Ray, kitClone } from "./build";
import { ctex, stoneHD, rockHD, cobbleHD, grassHD, cloudHD } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, D0, SHOTS, camAt, gapW, cutU, HITS, GAP_AT, PEAK, HALF_W, ridgeY, manjhiState, V3, FOREGROUND, ShotDef } from "./story";

// ---------------- assets ----------------
const KENNEY = ["tree_oak", "tree_default", "tree_detailed", "tree_fat", "tree_cone", "tree-high-round", "tree", "plant_bushLarge", "plant_bushDetailed",
  "plant_bush", "hedge", "flower_redA", "flower_yellowA", "flower_purpleA", "grass_large", "grass", "lily_large", "lantern", "cart", "stall-red",
  "stall-green", "stall-bench", "banner-red", "banner-green", "windmill", "canoe"];
let kitP: Promise<Kit> | null = null;
export const loadKit = () => {
  if (!kitP) {
    const loader = new GLTFLoader();
    kitP = Promise.all(KENNEY.map((n) => loader.loadAsync(staticFile(`bridge/kenney/${n}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const)))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
  }
  return kitP;
};

// ---------------- mountain geometry constants ----------------
// The ridge runs along x at z = 0: peak ~D0+42, base half-width 18 m, length 260 m (PEAK/HALF_W/ridgeY live in story.ts).
export const RIDGE_LEN = 260;
const hash2 = (x: number, z: number, seed: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233 + seed * 7.13) * 43758.5453;
  return s - Math.floor(s);
};

/** one half of the ridge: a noise-displaced grid from x0 to x1, plus the fresh-cut end-cap face at its inner end */
function ridgeHalf(x0: number, x1: number, seed: number, capFlip: boolean) {
  // NB: the noise amplitude is deliberately small (0.9 m) and the grid fine (60x20): with 2.4 m noise on a
  // 40x14 grid the ink pass read every grid cell as a crease (normal jumps > 35 deg) and drew a fan of black
  // wireframe lines across the sky over the distant western ridge (verified by the ink-off A/B still).
  const NX = 60, NZ = 20;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const x = x0 + (x1 - x0) * (i / NX);
    for (let j = 0; j <= NZ; j++) {
      const z = -HALF_W + 2 * HALF_W * (j / NZ);
      const u = Math.abs(z) / HALF_W;
      const prof = 1 - Math.pow(u, 1.6);
      let y = D0 + PEAK * prof * (1 + 0.12 * Math.sin(x * 0.045 + seed));
      // rocky noise: faded near the base (so the foot sits cleanly), near the slope-path band
      // (z ~ +-14, so the wife's path sits on the rock) and near x = 0 (the hammering face + crack).
      // NB: the fade band was +-3 m wide (divisor 8) and read as a pale shelf across the whole face in wides.
      const band = Math.exp(-((Math.abs(z) - 14) ** 2) / 3);
      const gapFlat = 1 - 0.7 * Math.exp(-(x * x) / 8);
      const nz = (hash2(x, z, seed) - 0.5) * 0.9 * (1 - 0.85 * band) * gapFlat * Math.min(1, (PEAK * prof) / 6 + 0.2);
      y = Math.max(y + nz, D0 + 0.05);
      pos.push(x, y, z); uv.push(x / 8, z / 8);
    }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const a = i * (NZ + 1) + j, b = (i + 1) * (NZ + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // end-cap: the fresh-cut face at the inner end (x1), a fan of quads from the base up to the profile
  const capPos: number[] = [], capUv: number[] = [], capIdx: number[] = [];
  for (let j = 0; j <= NZ; j++) {
    const z = -HALF_W + 2 * HALF_W * (j / NZ);
    const y = D0 + PEAK * (1 - Math.pow(Math.abs(z) / HALF_W, 1.6));
    capPos.push(x1, D0, z, x1, y, z); capUv.push(z / 8, 0, z / 8, y / 8);
  }
  for (let j = 0; j < NZ; j++) {
    const a = j * 2, b = (j + 1) * 2;
    if (capFlip) capIdx.push(a, a + 1, b + 1, a, b + 1, b);
    else capIdx.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute("position", new THREE.Float32BufferAttribute(capPos, 3));
  capGeo.setAttribute("uv", new THREE.Float32BufferAttribute(capUv, 2));
  capGeo.setIndex(capIdx); capGeo.computeVertexNormals();
  return { geo, capGeo };
}

/** sun disc (solid, soft rim) and the flat golden halo (lighting.md 6 / depth.md 6.4: r50 13-26 % of the frame width) */
const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const smokeTex = () => ctex("smoke", 256, 256, (g) => {
  const p = new Pen(g);
  for (const [x, y, r, c] of [[90, 150, 60, "#8f8d96"], [150, 120, 70, "#a3a1aa"], [170, 165, 55, "#8f8d96"], [120, 100, 50, "#b4b2ba"]] as const) p.ell(x, y, r, r * 0.85, c, 0);
});

/** every lens position of the film looking at its subject: centre, sides and top of frame (houses there are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 2) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = fw.length();
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

type Mats = Record<string, THREE.Material>;

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private ridgeW = new THREE.Group(); private ridgeE = new THREE.Group();
  private road: THREE.Mesh; private roadMat: THREE.Material;
  private crackA: THREE.Mesh; private crackB: THREE.Mesh;
  private fallRocks: { m: THREE.Mesh; sx: number; sy: number; sz: number; vx: number; vy: number; vz: number }[] = [];
  private dust: { m: THREE.Mesh; mat: THREE.MeshLambertMaterial; ox: number; oy: number; oz: number }[] = [];
  private clouds: THREE.Mesh[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(kit: Kit) {
    const R = this.root, M: Mats = {};
    // ---- sky + light ----
    // sky: 5 colour stops by elevation (textures.md 5.2 #5 + depth.md 2/6.5), written as tone-map-inverted linear values
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    // ---- ground: dry plain, green field patches, village lane, approach track (static batch) ----
    const b = new Batch();
    M.ground = lam("ground", () => ({ color: "#cbb98a" })); // dry Bihar earth
    M.field = lam("fieldHD", () => ({ map: grassHD() }));
    M.cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    M.dirt = lam("dirt", () => ({ color: "#c9a876" })); // flat dry dirt: the cobble map read as a brick path up close
    M.rock = lam("rockHD", () => ({ map: rockHD("rockHD", ["#9a8f80", "#8d8272", "#a89a86", "#7d7264", "#948878"], "#5f5348") }));
    M.cutRock = lam("cutRockHD", () => ({ map: rockHD("cutRockHD", ["#c2b096", "#b3a184", "#cbbca0", "#a8937a", "#bfae8e"], "#97876c") }));
    b.add(quadUp(-900, 900, -900, 900, 225, 225), M.ground);
    // green fields: around the village and a forest fringe north of the ridge
    for (const [x0, x1, z0, z1] of [[-140, -70, -75, -40], [60, 140, -70, -42], [-90, -30, 30, 70], [40, 130, 35, 80], [-160, 160, 60, 120]] as const)
      b.add(quadUp(x0, x1, z0, z1, (x1 - x0) / 4, (z1 - z0) / 4, 0.01), M.field);
    // village lane (cobble) + the dirt approach track from the village to the mountain foot
    b.add(quadUp(-60, 60, -55, -49, 30, 1.5, 0.02), M.cobble);
    b.add(quadUp(-1.6, 1.6, -49, -19, 0.8, 7.5, 0.02), M.dirt);
    // the long road around the mountain's east side (shot 8): a dirt strip under Manjhi's carry route
    // (centre (68.25,-38.25), direction (0.949,0.316) — the roadShot walk line; 12 m long, 3.2 m wide)
    // NB: its own darker red-brown material — plain M.dirt is the same colour as the ground, so in
    // golden shade the strip was invisible and Manjhi walked on bare blue ground. Raised 0.06 m:
    // at 0.02 m the face z-fought with the ground and only its inked edges showed as stray lines.
    // Corner order reversed vs the first attempt: quad()'s normal is (b-a)x(d-a), and the original
    // order faced DOWN, so the top face was culled and only the edges inked.
    {
      const rp = (s: number, w: number) => V(68.25 + 0.949 * s - 0.316 * w, D0 + 0.06, -38.25 + 0.316 * s + 0.949 * w);
      b.add(quad(rp(-6, 1.6), rp(6, 1.6), rp(6, -1.6), rp(-6, -1.6)), lam("roadDirt", () => ({ color: "#8a6a42" })));
    }
    b.build(R);
    buildVillage(R, kit, sightLines());

    // ---- the mountain: two halves + fresh-cut end caps ----
    const wHalf = ridgeHalf(-RIDGE_LEN / 2, 0, 1, false);
    const eHalf = ridgeHalf(0, RIDGE_LEN / 2, 2, true);
    const wm = new THREE.Mesh(wHalf.geo, M.rock), wc = new THREE.Mesh(wHalf.capGeo, M.cutRock);
    const em = new THREE.Mesh(eHalf.geo, M.rock), ec = new THREE.Mesh(eHalf.capGeo, M.cutRock);
    for (const m of [wm, wc, em, ec]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    this.ridgeW.add(wm, wc); this.ridgeE.add(em, ec);
    R.add(this.ridgeW, this.ridgeE);

    // ---- the cut road: a dirt strip through the gap, width = gap (invisible until the cut opens) ----
    this.roadMat = M.dirt;
    const roadGeo = new THREE.PlaneGeometry(1, 49); roadGeo.rotateX(-Math.PI / 2);
    this.road = new THREE.Mesh(roadGeo, this.roadMat);
    this.road.position.set(0, D0 + 0.03, 5.5); this.road.receiveShadow = true; this.road.visible = false;
    R.add(this.road);

    // ---- the slope path: a dirt ribbon on the south face at y ~ D0+14 (the wife's path) ----
    {
      const N = 24, pos: number[] = [], uv: number[] = [], idx: number[] = [];
      // A CONTOUR ledge at constant height (ridgeY(-14) + 0.15): the strip's vertices used to follow
      // ridgeY(z), so on the steep face (3.2 m of height per 1 m of z) the 0.6 m-wide ribbon was a
      // 1.9 m tall tan beam across the whole mountain in every wide. A flat ledge reads as a trail.
      // (The wife stands on it at D0+14, i.e. 0.05 m below the ledge top — her feet sit on it.)
      const PY = ridgeY(-14) + 0.15;
      for (let i = 0; i <= N; i++) {
        const x = -30 + (42 * i) / N;
        for (const z of [-13.8, -14.4]) pos.push(x, PY, z), uv.push(x / 4, z / 4);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      // flat dirt, no cobble map: up close the setts read as a brick wall, and this is a dirt track.
      // Colour kept warm tan: the darker #8a7a66 tried in round 3 went dark maroon in golden shade.
      const path = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: new THREE.Color("#a68c66"), side: THREE.FrontSide }));
      twoTone(path.material as THREE.MeshLambertMaterial, 0.15);
      path.receiveShadow = true; path.frustumCulled = false;
      R.add(path);
    }

    // ---- boulders along the mountain foot ----
    {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const inst = new THREE.InstancedMesh(geo, M.rock, 18);
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let k = 0; k < 18; k++) {
        let x: number, z: number, s: number;
        // the 3 near boulders sit clear of the S1b/S2b/S9a sightlines (they used to block the kneeling CU)
        if (k < 3) { x = [-9, 7, -13][k]; z = -21.5 + k * 0.4; s = 0.9 + k * 0.2; }
        else { x = -70 + (k - 3) * 9.5 + hash2(k, 7, 3) * 4; z = (k % 2 ? -21.5 : 21.5) + hash2(k, 11, 5) * 3; s = 0.8 + hash2(k, 13, 9) * 1.4; }
        e.set(hash2(k, 1, 2) * 3, hash2(k, 2, 4) * 3, hash2(k, 3, 6) * 3); q.setFromEuler(e);
        inst.setMatrixAt(k, this.m4.compose(V(x, D0 + s * 0.35, z), q, V(s, s * 0.75, s)));
      }
      inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
      R.add(inst);
    }

    // ---- the crack on the hammering face (appears in shot 6 as the rock gives way) ----
    // thin dark seams IN the rock, not planks: 4 cm wide, 1.4 / 0.9 m tall, flush with the face
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.9 });
    this.crackA = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.05), crackMat);
    this.crackA.position.set(0.35, D0 + 1.4, -17.6); this.crackA.rotation.x = 0.25; this.crackA.rotation.z = 0.12;
    this.crackB = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.05), crackMat);
    this.crackB.position.set(-0.45, D0 + 1.1, -17.6); this.crackB.rotation.x = 0.25; this.crackB.rotation.z = -0.3;
    for (const c of [this.crackA, this.crackB]) { c.visible = false; R.add(c); }

    // ---- falling rocks for the breakthrough (shot 10) ----
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + hash2(k, 5, 1) * 0.25, 0), M.rock);
      m.castShadow = true; m.visible = false; R.add(m);
      this.fallRocks.push({ m, sx: (hash2(k, 1, 7) - 0.5) * 2, sy: D0 + 6 + hash2(k, 2, 8) * 6, sz: -17.2,
        vx: (hash2(k, 3, 9) - 0.5) * 3, vy: 2.5 + hash2(k, 4, 10) * 2, vz: -1 - hash2(k, 6, 11) * 1.5 });
    }

    // ---- hammer dust: puffs at the strike point, bursting on every hit ----
    const dustT = smokeTex();
    for (let k = 0; k < 6; k++) {
      const mat = new THREE.MeshLambertMaterial({ map: dustT, transparent: true, depthWrite: false, color: new THREE.Color("#d8cbb2") });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.layers.set(NOINK); m.visible = false; R.add(m);
      this.dust.push({ m, mat, ox: (hash2(k, 1, 3) - 0.5) * 1.4, oy: hash2(k, 2, 4) * 0.8, oz: (hash2(k, 3, 5) - 0.5) * 0.8 });
    }

    // the CAM agent's near framing objects: built once, never passed through the sight-line filter, toggled per frame
    for (const fg of FOREGROUND) {
      const o = kitClone(kit, fg.kit, fg.s ?? 1);
      if (!o) continue;
      o.position.set(...fg.pos); o.rotation.y = fg.yaw ?? 0; o.visible = false;
      this.fgs.push({ o, a: fg.a, b: fg.b }); R.add(o);
    }
  }

  /** camera-relative sun, frozen per shot: the shot's mean view direction turned by az toward screen right, lifted by el */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az); // screen right = (-fz, fx)
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], tau = s.tau(t), b = manjhiState(id, t), L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK); // sky, clouds and dust sprites live on the no-ink layer but are still rendered
    // ---- light rig (lighting.md 9.4): camera-relative sun frozen per shot, two-tone uniforms, shadow fit ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30); // el 7: 2 m cards throw ~16 m shadows, houses much longer
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0; // not used by the two-tone shading
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog (colour = horizon colour, linear fogNear -> fogFar), sun disc + halo, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    // ---- foreground framing objects: inside their frames AND their own shot (so a crossfade layer never shows them) ----
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b && g.a < s.b && g.b > s.a;
    // ---- mountain ----
    this.poseMountain(t, cam);
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, b, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "golden" ? "#ffcf9e" : "#ffffff";
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      if (a.mat.emissiveMap) a.mat.emissive.set(tint); // legacy emissive card until the CHAR agent's cardShade lands
      a.mesh.castShadow = L.actorShadow; // day: soft contact blobs instead (CHAR agent)
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e = this.fx(fi++);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    return focus;
  }

  /** slide the ridge halves apart as the cut widens, open the road, grow the crack, drop rocks, puff dust */
  private poseMountain(t: number, cam: THREE.PerspectiveCamera) {
    const gap = gapW(t), u = cutU(t);
    this.ridgeW.position.x = -gap / 2;
    this.ridgeE.position.x = gap / 2;
    // the cut road appears as the gap opens
    this.road.visible = gap > 0.15;
    if (this.road.visible) this.road.scale.x = gap;
    // the crack on the hammering face grows with the cut (shot 6 onward)
    const showCrack = t >= 19.4;
    this.crackA.visible = this.crackB.visible = showCrack;
    if (showCrack) { const s = 0.3 + 0.7 * u; this.crackA.scale.y = s; this.crackB.scale.y = s; }
    // falling rocks: the breakthrough blow lands at 33.83 s
    const dt = t - 33.83;
    for (const r of this.fallRocks) {
      if (dt < 0) { r.m.visible = false; continue; }
      const tl = Math.min(dt, (r.vy + Math.sqrt(r.vy * r.vy + 2 * 9.8 * (r.sy - D0 - 0.3))) / 9.8);
      r.m.position.set(r.sx + r.vx * tl, r.sy + r.vy * tl - 4.9 * tl * tl, r.sz + r.vz * tl);
      r.m.rotation.set(tl * 3, tl * 2, 0);
      r.m.visible = true;
    }
    // hammer dust: a burst at the strike point after every hit, fading over ~0.9 s
    let lastHit = -1;
    for (const h of HITS) if (h <= t) lastHit = h;
    const ddt = t - lastHit;
    const on = lastHit >= 0 && ddt < 0.9;
    for (const d of this.dust) {
      d.m.visible = on;
      if (!on) continue;
      const sc = 0.8 + ddt * 4;
      d.m.position.set(GAP_AT[0] + d.ox, GAP_AT[1] + d.oy + ddt * 1.2, GAP_AT[2] + d.oz);
      d.m.scale.set(sc, sc, 1);
      d.m.quaternion.copy(cam.quaternion);
      d.mat.opacity = 0.7 * (1 - ddt / 0.9);
    }
  }
}

/** horizontal quad facing up at height D0 + dy covering x0..x1, z0..z1 (z0 < z1) */
function quadUp(x0: number, x1: number, z0: number, z1: number, u: number, v: number, dy = 0) {
  const y = D0 + dy, g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}
