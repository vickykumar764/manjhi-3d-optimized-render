# Final mix of the Manjhi short: the voice (gain only) + original march score (ducked under speech,
# -14 dB vs the voice per section — the user's Manjhi standard from the Hindi video fix) + synthesized SFX
# stem (-10 dB vs the voice per section). Master gain to -14 LUFS integrated, 4x-oversampled look-ahead
# limiter for <= -1 dBTP, exactly 41.796 s / 48 kHz / stereo / 24-bit.
# Writes mix.wav + stem_voice/music/sfx.wav (at mix gain, pre-limiter) + cues.md (music map, SFX cues, loudness).
# The duck/limiter helpers are copied from the bridge skill's mix.py and adapted to the Manjhi length.
import os
import time
import numpy as np
from scipy import ndimage, signal
from dsp import (SR, ns, st, dbg, read_wav, write_wav, integrated, momentary, momentary_max, short_term, lra, true_peak, fades)
import timeline_manjhi as T
import sfx_manjhi
import music_manjhi

HERE = os.path.dirname(os.path.abspath(__file__))
N = ns(T.DUR)                    # 2,006,208 samples = 41.796 s
TARGET_LUFS = -14.0
CEIL_DBTP = -1.2                 # limiter ceiling (spec: true peak <= -1 dBTP)
DUCK_DB = -3.0                   # music dip while the voice speaks (key = words.json, not the audio)
MUSIC_DB = -14.0                 # music vs voice per section (user's Manjhi standard)
SFX_DB = -10.0                   # SFX vs voice per section (user's Manjhi standard)


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


# ================================================================ voice
def load_voice():
    x, sr = read_wav(os.path.join(HERE, "voice.wav"))
    assert sr == SR, sr
    v = x[0] if x.shape[0] == 1 else x.mean(0)
    out = np.zeros(N)
    out[: min(N, len(v))] = v[:N]
    return st(out)


def speech_spans(words, merge=0.3):
    sp = []
    for w in words:
        s, e = float(w["start"]), float(w["end"])
        if sp and s - sp[-1][1] < merge:
            sp[-1][1] = max(sp[-1][1], e)
        else:
            sp.append([s, e])
    return sp


def duck_db(spans, depth=DUCK_DB, pre=0.08, post=0.12, att=0.07, rel=0.45):
    ctrl = 1000
    nc = int(T.DUR * ctrl) + 2
    va = np.zeros(nc)
    for s, e in spans:
        va[max(0, int((s - pre) * ctrl)): int((e + post) * ctrl)] = 1.0
    ka, kr = 1 - np.exp(-1 / (att * ctrl)), 1 - np.exp(-1 / (rel * ctrl))
    env = np.zeros(nc)
    e = 0.0
    for i in range(nc):
        tgt = va[i]
        e += (tgt - e) * (ka if tgt > e else kr)
        env[i] = e
    return np.interp(np.arange(N) / SR, np.arange(nc) / ctrl, depth * env)


# ================================================================ per-section level automation
def section_curve(stem, v, target_db, skip=()):
    """gain curve (dB) so the stem sits `target_db` under the voice in every section; smoothed 0.4 s"""
    gains = {}
    for name, a, b in music_manjhi.SECTIONS:
        if name in skip:
            continue
        seg = slice(ns(a), ns(b))
        Ls, Lv = integrated(stem[:, seg]), integrated(v[:, seg])
        gains[name] = (Lv + target_db - Ls) if np.isfinite(Ls) else 0.0
    for name in skip:
        gains[name] = gains.get("story", 0.0)
    pts = [(a, gains[name]) for name, a, b in music_manjhi.SECTIONS]
    curve = np.zeros(N)
    t = np.arange(N) / SR
    for a, g in pts:
        curve[t >= a] = g
    sm = ndimage.uniform_filter1d(curve, ns(0.4), mode="nearest")
    return sm, gains


# ================================================================ limiter (from the bridge skill's mix.py)
def limiter(x, ceil_db=CEIL_DBTP, look=0.003, rel=0.08):
    """4x-oversampled peak detection, look-ahead min filter, release one-pole, centred smoothing -> gain curve"""
    c = dbg(ceil_db)
    n = x.shape[1]
    up = np.abs(signal.resample_poly(x, 4, 1, axis=-1)).max(0)
    pk = np.pad(up, (0, max(0, 4 * n - len(up))))[: 4 * n].reshape(n, 4).max(1)
    gr = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    La = max(1, ns(look))
    g1 = ndimage.minimum_filter1d(gr, 2 * La + 1, mode="nearest")
    g2 = g1.copy()
    idx = np.flatnonzero(g1 < 1.0)
    if len(idx):
        kr = 1 - np.exp(-1 / (rel * SR))
        gap = ns(rel * 8)
        brk = np.flatnonzero(np.diff(idx) > gap)
        starts = np.concatenate([[idx[0]], idx[brk + 1]])
        ends = np.concatenate([idx[brk], [idx[-1]]])
        for a, b_ in zip(starts, ends):
            e = min(n, b_ + gap)
            seg = g1[a:e]
            out = np.empty(len(seg))
            g = 1.0
            for k in range(len(seg)):
                g = min(seg[k], g + (1 - g) * kr)
                out[k] = g
            g2[a:e] = out
    g3 = ndimage.uniform_filter1d(g2, 2 * La + 1, mode="nearest")
    g3 = np.minimum(g3, 1.0)
    return x * g3[None, :], g3


def lufs(x):
    v = integrated(x)
    return v if np.isfinite(v) else -99.0


def main():
    log("loading voice")
    v = load_voice()
    words = T.words()
    log("rendering music")
    m_raw, _levels, music_cues = music_manjhi.render()
    log("rendering SFX")
    s_raw = sfx_manjhi.render()
    # duck the music under speech, then level both stems per section against the voice
    spans = speech_spans(words)
    m_ducked = m_raw * dbg(duck_db(spans))[None, :]
    m_curve, m_gains = section_curve(m_ducked, v, MUSIC_DB, skip=("fall",))
    m = m_ducked * dbg(m_curve)[None, :]
    s_curve, s_gains = section_curve(s_raw, v, SFX_DB)
    s = s_raw * dbg(s_curve)[None, :]
    log("music gains per section:", {k: round(g, 1) for k, g in m_gains.items()})
    log("sfx gains per section:", {k: round(g, 1) for k, g in s_gains.items()})
    # master to -14 LUFS, then limit; the limiter shaves a little loudness, so iterate the master gain once
    # (limit -> measure -> re-gain -> re-limit) until the post-limiter integrated loudness is on target.
    pre = v + m + s
    g_master = dbg(TARGET_LUFS - lufs(pre))
    mix = None
    for _ in range(3):
        mix, _g3 = limiter(pre * g_master)
        L = lufs(mix)
        log(f"pass: master gain {20 * np.log10(g_master):+.1f} dB -> post-limiter {L:.2f} LUFS")
        if abs(L - TARGET_LUFS) <= 0.15:
            break
        g_master *= dbg(TARGET_LUFS - L)
    log(f"final: {lufs(mix):.1f} LUFS integrated, true peak {true_peak(mix):.2f} dBTP, "
        f"LRA {lra(mix):.1f} LU, momentary max {momentary_max(mix):.1f} LUFS")
    write_wav(os.path.join(HERE, "mix.wav"), mix)
    write_wav(os.path.join(HERE, "stem_voice.wav"), v * g_master)
    write_wav(os.path.join(HERE, "stem_music.wav"), m * g_master)
    write_wav(os.path.join(HERE, "stem_sfx.wav"), s * g_master)
    # report
    with open(os.path.join(HERE, "cues.md"), "w") as f:
        f.write("# Manjhi mix cues\n\n")
        f.write(f"Voice: {lufs(v):.1f} LUFS integrated. Music target {MUSIC_DB} dB vs voice, SFX target {SFX_DB} dB vs voice.\n")
        f.write(f"Final mix: {lufs(mix):.1f} LUFS integrated, true peak {true_peak(mix):.2f} dBTP, LRA {lra(mix):.1f} LU.\n\n")
        f.write("## Music sections\n\n")
        for name, a, b in music_manjhi.SECTIONS:
            seg = slice(ns(a), ns(b))
            f.write(f"- {name} {a:.2f}-{b:.2f} s: voice {lufs(v[:, seg]):.1f} LUFS, music {lufs(m[:, seg]):.1f} LUFS "
                    f"(gain {m_gains[name]:+.1f} dB), sfx {lufs(s[:, seg]):.1f} LUFS (gain {s_gains[name]:+.1f} dB)\n")
        f.write("\n## Music cues\n\n")
        for (t, c) in music_cues:
            f.write(f"- {t:6.2f} s  {c}\n")
        f.write("\n## SFX cues\n\n")
        sfx_manjhi.build_cues()
        for (t, name, desc, _a, gain_db, kind) in sfx_manjhi.CUES:
            f.write(f"- {t:6.2f} s [{kind}] {name} ({gain_db:+.0f} dB): {desc}\n")
    log("wrote mix.wav + stems + cues.md")


if __name__ == "__main__":
    main()
