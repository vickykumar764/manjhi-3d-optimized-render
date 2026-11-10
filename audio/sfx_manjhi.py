# Every sound effect + ambience bed of the Manjhi short as a cue list timed to the picture
# (timeline_manjhi.py), rendered into one stereo SFX stem. Generators come from sfx_gen.py (shared with the
# bridge skill); levels here are RELATIVE inside the stem — mix_manjhi.py sets the stem to -10 dB vs the voice.
# Beds run under the whole film; events land on the hammer hits, the fall, the laughs and the payoff.
import os
import numpy as np
from dsp import SR, ns, tt, rng, dbg, lp, hp, pan, st, place, fades, integrated, momentary_max, write_wav
import sfx_gen as G
import timeline_manjhi as T

HERE = os.path.dirname(os.path.abspath(__file__))
N = ns(T.DUR)

# (t, name, desc, audio, gain_db, kind) — audio is a mono/stereo array, gain is relative inside the stem
CUES = []


def _add(t, name, desc, audio, gain_db, kind="event"):
    CUES.append((t, name, desc, audio, gain_db, kind))


def _norm(x, peak=0.5):
    m = np.max(np.abs(x)) if x.size else 0.0
    return x * (peak / m) if m > 0 else x


def build_cues():
    CUES.clear()
    R = rng(1960)
    rr = lambda: rng(int(R.integers(1 << 30)))

    # ---- ambience beds (whole film, crossfaded by section) ----
    def amb_day(dur, seed):
        r = rng(seed)
        x = G.breeze(dur, r, 1.0, 0.15, 850)
        x = x + pan(G.bird_chirps(dur, r, 0.45, "sparrow") * 0.10, 0.5)
        x = x + pan(G.bird_chirps(dur, r, 0.30, "sparrow") * 0.07, -0.6)
        return fades(x, 0.4, 0.6)
    _add(0.0, "amb_day", "daytime village air: breeze + sparrows (shots 1-6)", amb_day(22.4, 11), -14, "bed")

    def amb_golden(dur, seed):
        r = rng(seed)
        x = G.breeze(dur, r, 0.7, 0.12, 700)
        x = x + st(G.crickets(dur, r, 3) * 0.25)
        x = x + pan(G.bird_chirps(dur, r, 0.25, "sparrow") * 0.06, -0.4)
        return fades(x, 0.5, 0.5)
    _add(22.3, "amb_golden", "golden-hour calm: soft breeze, crickets (shots 7-9)", amb_golden(9.5, 12), -16, "bed")
    _add(31.7, "amb_day2", "daytime air returns: breeze + sparrows (shots 10-12)", amb_day(10.1, 13), -14, "bed")

    # ---- hammer strikes: one hit per HITS time; the breakthrough blow is bigger + rock tear ----
    for th in T.HITS:
        big = 1.6 if th == T.BREAK_T else 1.0
        _add(th, "hammer", f"hammer on rock ({th:.2f} s)", _norm(G.hammer_hit(rr(), big), 0.9), 0.0)
        if th in (32.5, 33.17, T.BREAK_T):
            _add(th, "rock_crack", f"rock chips crack ({th:.2f} s)", _norm(G.wood_crack(rr()), 0.7), -4.0)
    _add(T.BREAK_T, "rock_tear", "the mountain splits: long rock tear under the breakthrough blow",
         _norm(G.timber_tear(rr(), 0.9), 0.8), -2.0)

    # ---- villagers laughing (shot 4, 12.57-15.33 s): crowd babble + a few laughs ----
    _add(12.6, "laugh_crowd", "villagers laughing at him (shot 4)", _norm(st(G.babble(2.7, rr(), 120, 1.0, rate=5.0)), 0.5), -2.0)
    for lt in (13.1, 13.9, 14.6):
        _add(lt, "laugh_one", "one villager's laugh", _norm(G.hurrah(rr(), 130, 0.7), 0.45), -6.0)

    # ---- the wife's fall (shot 7): whoosh down, impact grunt + thud on landing ----
    _add(T.FALL_T0, "fall_whoosh", "she slips: air whoosh down the slope", _norm(G.whoosh(0.7, rr(), 0.5, 300, 1800), 0.5), -3.0)
    _add(T.FALL_T1, "fall_oof", "she lands: impact grunt", _norm(G.oof(rr(), "oof"), 0.7), -2.0)
    _add(T.FALL_T1, "fall_thud", "she lands: body thud", _norm(G.boot(rr(), 1.0), 0.8), -4.0)

    # ---- footsteps: climbing the slope (shot 3), carrying her (shot 8), walkers (shot 11) ----
    for i, ft in enumerate(np.arange(10.1, 12.5, 0.5)):
        _add(float(ft), "step_climb", f"boot on the slope path ({ft:.1f} s)", _norm(G.boot(rr(), 0.9), 0.35), -8.0)
    for i, ft in enumerate(np.arange(26.7, 29.4, 0.55)):
        _add(float(ft), "step_carry", f"slow step carrying her ({ft:.1f} s)", _norm(G.stroll_step(rr(), 0.4), 0.3), -9.0)
    for i, ft in enumerate(np.arange(35.0, 37.3, 0.5)):
        _add(float(ft), "step_walk", f"villager step on the new road ({ft:.1f} s)", _norm(G.stroll_step(rr(), 0.5), 0.3), -9.0)

    # ---- payoff (shot 12): the village cheers as the road opens ----
    _add(37.4, "cheer", "villagers cheer at the open road", _norm(G.applause(3.5, rr(), people=24), 0.6), -2.0)
    for ct in (37.5, 38.4, 39.3):
        _add(ct, "hurrah", "a 'hurrah!' from the crowd", _norm(G.hurrah(rr(), 140, 0.8), 0.5), -5.0)
    return CUES


def render():
    build_cues()
    stem = np.zeros((2, N))
    for (t, name, desc, audio, gain_db, kind) in CUES:
        x = audio if np.ndim(audio) == 2 else st(audio)
        place(stem, x, t, dbg(gain_db))
    return stem


if __name__ == "__main__":
    stem = render()
    write_wav(os.path.join(HERE, "sfx.wav"), stem)
    print(f"sfx.wav: {stem.shape[1] / SR:.3f} s, integrated {integrated(stem):.1f} LUFS, peak {np.max(np.abs(stem)):.3f}")
    with open(os.path.join(HERE, "cues.md"), "w") as f:
        f.write("# Manjhi SFX cues\n\n")
        for (t, name, desc, _a, gain_db, kind) in CUES:
            f.write(f"- {t:6.2f} s [{kind}] {name} ({gain_db:+.0f} dB): {desc}\n")
    print(f"{len(CUES)} cues written to cues.md")
