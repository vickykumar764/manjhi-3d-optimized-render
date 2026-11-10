# Original light march for the Manjhi short, composed and synthesized here (Bb major, 120 bpm, same theme
# language as the bridge skill's score: one quarter note = 0.5 s). Sections follow the picture: hook tutti |
# story march | playful laugh | years passing, band building | DEAD STOP for the flashback fall | soft warm
# theme for the carry and the kneel | march returns forte for the breakthrough | walk | triumphant payoff.
# Built with the bridge skill's Band helpers (music.py); rendered and trimmed to 41.796 s by mix_manjhi.py.
import os
import numpy as np
from dsp import SR, ns, rng, dbg, make_ir, convolve_st, integrated, lp, hp
import instruments as I
from music import Band, theme, chorus, melody, oompah, snare_bar, roll, CHB, CH, F, Q
import timeline_manjhi as T

# where each section of the music sits (used for the cue sheet and the level automation in mix_manjhi.py)
SECTIONS = [
    ("hook", 0.0, 3.73), ("story", 3.73, 12.57), ("laugh", 12.57, 15.33), ("years", 15.33, 22.33),
    ("fall", 22.33, 25.5), ("carry", 25.5, 31.7), ("break", 31.7, 34.83), ("walk", 34.83, 37.33),
    ("payoff", 37.33, T.DUR),
]

R = rng(1960)


def _r():
    return rng(int(R.integers(1 << 30)))


def build():
    b = Band()
    for name, send in [("whistle", 0.0), ("fife", 0.16), ("glock", 0.22), ("tuba", 0.10), ("pah", 0.18), ("snare", 0.13),
                       ("cymbal", 0.16), ("stab", 0.16), ("timpani", 0.18), ("pad", 0.25), ("vibes", 0.26), ("musicbox", 0.26),
                       ("pluck", 0.18), ("brush", 0.12), ("triangle", 0.25)]:
        b.track(name, send)

    # ============ HOOK 0 - 3.73: tutti + whistlers, snare fill under the last hook words, dip at the white flash
    h = theme(0.0, bars=[1, 2])
    chorus(b, "whistle", h, 7, 11)
    melody(b, "glock", h, 0.5, 12, "glock", -0.35)
    for bar in (1, 2):
        tb = (bar - 1) * 2.0
        oompah(b, tb, CHB[bar], 0.68, True, 0.42)
        snare_bar(b, tb, "march", 0.62, steps=range(16) if bar == 1 else range(8))
    roll(b, 3.0, 3.6, 0.25, 0.62)
    b.add("cymbal", I.cymbal(0.45, _r()), 0.0, 0.0)
    b.cues.append((0.0, "hook: theme A1-A2 tutti, 7 whistlers, tuba/after-beats/snare; snare fill 3.0-3.6"))
    # a short dip at the flash (frame 110), then the band comes back for the village
    dip = np.ones(ns(67.5))
    a, z = ns(T.FLASH - 0.02), ns(T.FLASH + 0.18)
    dip[a:z] = np.linspace(1, 0.25, z - a)
    dip[z:z + ns(0.3)] = np.linspace(0.25, 1, ns(0.3))
    for k in b.tr:
        b.tr[k] *= dip[None, :]
    b.cues.append((T.FLASH, "short dip on the white flash after the hook (frame 110)"))

    # ============ STORY 4.0 - 12.5: theme A bars 3-8 light (glock + fife, tuba on 1/3, light snare)
    s0 = 4.0
    a38 = theme(s0, bars=range(3, 9))
    melody(b, "glock", a38, 0.36, 12, "glock", -0.35)
    melody(b, "fife", a38, 0.42, 0, "fife", 0.25)
    for bar in range(3, 9):
        tb = s0 + (bar - 3) * 2
        oompah(b, tb, CHB[bar], 0.5, False, 0.34)
        snare_bar(b, tb, "light", 0.36)
    b.cues.append((s0, "story: theme A3-A8 light (glock + fife, tuba on 1/3, horns on 2/4, light snare)"))

    # ============ LAUGH 12.5 - 15.3: playful swung theme, softer band (the village laughs)
    l0 = 12.5
    lw = theme(l0, bars=[1, 2], swing=True)
    chorus(b, "whistle", lw, 3, 21, spread=0.8)
    melody(b, "glock", lw, 0.3, 12, "glock", -0.35)
    for bar in (1, 2):
        tb = l0 + (bar - 1) * 2
        oompah(b, tb, CHB[bar], 0.4, True, 0.3)
        snare_bar(b, tb, "light", 0.3, steps=range(8))
    b.cues.append((l0, "laugh: swung theme A1-A2, 3 whistlers, soft band"))

    # ============ YEARS 16.0 - 22.3: full band, theme A3-A8 again, tuba bouncing octaves as the cut grows
    y0 = 16.0
    y38 = theme(y0, bars=range(3, 9))
    melody(b, "glock", y38, 0.5, 12, "glock", -0.35)
    melody(b, "fife", y38, 0.58, 0, "fife", 0.25)
    for bar in range(3, 9):
        tb = y0 + (bar - 3) * 2
        oompah(b, tb, CHB[bar], 0.64, True, 0.44, bounce=tb >= 20.0)
        snare_bar(b, tb, "march", 0.58, steps=range(16) if bar < 8 else range(12))
    roll(b, 21.5, 22.2, 0.3, 0.7)
    b.cues.append((y0, "years: full band theme A3-A8, tuba bouncing octaves from 20.0 as the cut deepens"))
    b.cues.append((22.33, "DEAD STOP at the golden flashback - music silent through the fall"))

    # ============ FALL 22.33 - 25.5: silence (the slip and the landing play dry)
    # (nothing is added here; the stop below silences every track from 22.33 to 25.5)
    stop = np.ones(ns(67.5))
    a, z = ns(22.33), ns(25.5)
    stop[a:z] = 0
    stop[z:z + ns(0.4)] = np.linspace(0, 1, ns(0.4))
    for k in b.tr:
        b.tr[k] *= stop[None, :]

    # ============ CARRY + KNEEL 25.5 - 31.7: soft warm theme — pad chords, vibes, solo fife (no tuba, no snare)
    c0 = 25.5
    chords = [(25.5, 27.4, [46, 58, 62, 65]), (27.4, 29.3, [46, 55, 63, 67]), (29.3, 31.7, [41, 57, 60, 63])]
    trem = lambda t0: (lambda t: 1 + 0.08 * np.sin(2 * np.pi * 0.6 * (t + t0 - c0)))
    for (ta, tb_, ms) in chords:
        b.add("pad", I.pad([F(m) for m in ms], tb_ - ta, 0.5, _r(), att=0.5 if ta < 25.6 else 0.25, rel=0.6, trem=trem(ta)), ta, 0.0)
    cm = theme(c0, bars=[1, 2])
    melody(b, "fife", cm, 0.5, 0, "fife", 0.25)
    melody(b, "vibes", cm, 0.3, 12, "vibes", -0.25)
    b.cues.append((c0, "carry/kneel: warm pad Bb - Eb/Bb - F7, solo fife theme, vibes; no drums (grief, not march)"))

    # ============ BREAKTHROUGH 32.0 - 34.8: the march returns forte, snare drive, roll into the blow, stab ON it
    k0 = 32.0
    kb = theme(k0, bars=[5, 6])
    melody(b, "glock", kb, 0.55, 12, "glock", -0.35)
    melody(b, "fife", kb, 0.6, 0, "fife", 0.25)
    for bar in (5, 6):
        tb = k0 + (bar - 5) * 2
        oompah(b, tb, CHB[bar], 0.72, True, 0.5)
        snare_bar(b, tb, "drive", 0.66, steps=range(16), cres=0.3)
    roll(b, 33.0, 33.8, 0.45, 1.0)
    for m in [46, 53, 58, 62, 65]:
        b.add("stab", I.brass(F(m), 0.25, 0.9, _r(), "stab", scoop=-15), T.BREAK_T, (m - 56) / 20)
    b.add("tuba", I.brass(F(34), 0.3, 0.9, _r(), "tuba"), T.BREAK_T, -0.1)
    b.add("cymbal", I.cymbal(0.5, _r(), dur=1.2), T.BREAK_T, 0.0)
    b.cues.append((k0, "breakthrough: forte march, snare drive, roll into 33.83, Bb stab + clash ON the blow"))

    # ============ WALK 35.0 - 37.3: march medium, theme A7-A8
    w0 = 35.0
    w78 = theme(w0, bars=[7, 8])
    melody(b, "glock", w78, 0.45, 12, "glock", -0.35)
    melody(b, "fife", w78, 0.5, 0, "fife", 0.25)
    for bar in (7, 8):
        tb = w0 + (bar - 7) * 2
        oompah(b, tb, CHB[bar], 0.6, True, 0.42)
        snare_bar(b, tb, "march", 0.55)
    b.cues.append((w0, "walk: theme A7-A8, medium band, the new road"))

    # ============ PAYOFF 37.5 - 41.8: tutti + whistlers, theme A1-A2, final Bb chord
    p0 = 37.5
    ph = theme(p0, bars=[1, 2])
    chorus(b, "whistle", ph, 7, 31)
    melody(b, "glock", ph, 0.55, 12, "glock", -0.35)
    melody(b, "fife", ph, 0.6, 0, "fife", 0.25)
    for bar in (1, 2):
        tb = p0 + (bar - 1) * 2
        oompah(b, tb, CHB[bar], 0.7, True, 0.45)
        snare_bar(b, tb, "march", 0.62)
    for m in [46, 58, 62, 65]:
        b.add("stab", I.brass(F(m), 1.2, 0.7, _r(), "stab", scoop=-15), 41.0, (m - 56) / 20)
    b.add("tuba", I.brass(F(34), 1.0, 0.7, _r(), "tuba"), 41.0, -0.1)
    b.cues.append((p0, "payoff: tutti + 7 whistlers, theme A1-A2, final Bb chord at 41.0"))
    return b


def render():
    """render the band (67.5 s buffers from music.py) and trim to the Manjhi length"""
    from music import render as music_render
    b = build()
    out, levels = music_render(b, ref=-20.0)
    n = ns(T.DUR)
    return out[:, :n], levels, b.cues


if __name__ == "__main__":
    from dsp import write_wav, integrated
    out, levels, cues = render()
    write_wav(os.path.join(os.path.dirname(os.path.abspath(__file__)), "music.wav"), out)
    print(f"music.wav: {out.shape[1] / SR:.3f} s, integrated {integrated(out):.1f} LUFS")
    print("levels:", levels)
    for (t, c) in cues:
        print(f"  {t:6.2f} s  {c}")
