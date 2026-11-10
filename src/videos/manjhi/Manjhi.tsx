// "Dashrath Manjhi — The Mountain Man": our Hindi short in the flat-characters-in-a-3D-toon-world style.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts).
// *** OPTIMIZED COPY (2026-11-10) — see OPTIMIZATION_NOTES.md. Differences from the original:
//   1. Half-resolution render: the WebGL buffer is 540x960 (ThreeCanvas width/height), wrapped in a
//      div CSS-scaled 2x so the 1080x1920 composition still outputs 1080x1920. The whole post chain
//      (ink + grade) runs at quarter pixels; ink/grade pixel sizes scale with output height, so the
//      look is the same relative size. The PostDriver pattern is UNCHANGED (useMemo composer +
//      priority-1 useFrame) — never use the <EffectComposer> wrapper in Remotion render mode.
//   2. Lens blur (pre + main) and bloom are OFF by default (toggles below) — the DOF is gone, so
//      backgrounds are sharp now; this is the experiment's look tradeoff, recorded in
//      OPTIMIZATION_NOTES.md. Ink + NEUTRAL tone + grade still run.
// Post chain (optimized): RenderPass -> InkPass -> [NEUTRAL tone mapping + colour grade]
// (one merged EffectPass), MSAA 4, HalfFloat.
// Place changes crossfade by stacking a second canvas for the fade frames; the hook ends on a 4-frame white flash.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer as PPComposer, EffectPass, RenderPass } from "postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { Kit } from "./build";
import { TOTAL, FLASH_AT, SHOTS, layersAt, dofAt } from "./story";

export const MANJHI_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
/** OPTIMIZED: lens + bloom default OFF (see header). Pass `{ post: { lens: true, bloom: true } }` to restore the full chain. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean };
const toggles = (): PostToggles => ({ ink: true, lens: false, pre: false, bloom: false, grade: true, grain: false, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

/** Bloom for emissive sources only. Its MIP chain always starts at 540x960 (half of 1080x1920),
 *  whatever the output size, so the glow keeps the same size relative to the frame at 540, 1080 and 1440 widths.
 *  ADD blend: HDR-safe (SCREEN darkens values > 1). */
const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("manjhi kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit }> = ({ id, kit }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(kit), [kit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
    grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }), // film grain, OFF by default
  }), [camera, scene]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, SHOTS[id - 1].light);
  fx.grain.seed = f; // deterministic per frame
  const postOn = on.ink || on.lens || on.bloom || on.grade;
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {postOn ? <PostDriver fx={fx} on={on} /> : null}
    </>
  );
};

/** Manual post-processing driver — replaces the @react-three/postprocessing
 *  <EffectComposer> wrapper (see note below). The wrapper creates its plain
 *  postprocessing composer inside a passive useEffect, but Remotion's advance()
 *  runs BEFORE a child component's passive effects, so in render mode the frame
 *  renders with no composer present — blank canvas, NO error. (The Ancient Jar
 *  build on the same stack hit exactly this: many blank ~3.8 KB stills; the
 *  PostDriver pattern fixed it — proof frame out/test-stills/ac100.jpg there.
 *  Our Manjhi stills happened to paint through the wrapper — fiber 8's wrapper
 *  evidently creates the composer early enough in still mode — but the full
 *  `remotion render` path is the same advance() mechanism, so the wrapper is
 *  not trusted for the final render. This driver creates the composer
 *  synchronously during render (useMemo) and drives it from a priority-1
 *  useFrame. Pass order mirrors the skill's chain exactly:
 *  RenderPass -> InkPass -> LensBlur pre -> LensBlur main -> [bloom + tone + grade]
 *  in ONE merged EffectPass (grain appended when on).
 *  OPTIMIZED COPY: with the default toggles (lens/bloom off) the chain is just
 *  RenderPass -> InkPass -> ONE merged EffectPass (tone + grade). Pass `{ post: { lens: true, bloom: true } }`
 *  to restore the full chain. */
const PostDriver: React.FC<{
  fx: {
    ink: InkPass;
    lens: LensBlur;
    bloom: BloomEffect;
    tone: ToneMappingEffect;
    grade: GradeEffect;
    grain: GrainEffect;
  };
  on: PostToggles;
}> = ({ fx, on }) => {
  const { gl, scene, camera } = useThree();
  const composer = useMemo(() => {
    const c = new PPComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
    c.addPass(new RenderPass(scene, camera as THREE.PerspectiveCamera));
    if (on.ink) c.addPass(fx.ink);
    if (on.lens && on.pre) c.addPass(new EffectPass(camera, fx.lens.pre));
    if (on.lens) c.addPass(new EffectPass(camera, fx.lens.main));
    const tail: (BloomEffect | ToneMappingEffect | GradeEffect | GrainEffect)[] = [];
    if (on.bloom) tail.push(fx.bloom);
    tail.push(fx.tone);
    if (on.grade) tail.push(fx.grade);
    if (on.grain) tail.push(fx.grain);
    c.addPass(new EffectPass(camera, ...tail));
    return c;
  }, [gl, scene, camera, fx, on]);
  useEffect(() => () => composer.dispose(), [composer]);
  const applied = React.useRef({ w: -1, h: -1, dpr: -1 });
  const tmpSize = useMemo(() => new THREE.Vector2(), []);
  useFrame((_, delta) => {
    gl.getSize(tmpSize);
    const dpr = gl.getPixelRatio();
    if (tmpSize.width !== applied.current.w || tmpSize.height !== applied.current.h || dpr !== applied.current.dpr) {
      composer.setSize(tmpSize.width, tmpSize.height);
      applied.current = { w: tmpSize.width, h: tmpSize.height, dpr };
    }
    composer.render(delta);
  }, 1);
  return null;
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
/** OPTIMIZED: WebGL buffer is 540x960 (quarter pixels); the wrapping div CSS-scales it 2x to fill
 *  the 1080x1920 composition, so the mp4 stays 1080x1920. R3F's buffer size comes from the
 *  width/height props (x dpr, clamped >= 1); the CSS transform does not change the canvas
 *  element's offsetSize, so the buffer stays 540x960. The PostDriver composer sizes itself from
 *  gl.getSize(), i.e. it also runs at 540x960. */
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number }> = ({ id, kit, alpha }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <div style={{ width: 540, height: 960, transform: "scale(2)", transformOrigin: "0 0" }}>
      <ThreeCanvas width={540} height={960} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
        camera={{ fov: 40, near: 0.2, far: 1500 }}>
        <Inner id={id} kit={kit} />
      </ThreeCanvas>
    </div>
  </AbsoluteFill>
);

export const ManjhiShort: React.FC = () => {
  const f = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
    </AbsoluteFill>
  );
};
