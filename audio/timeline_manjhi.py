# Picture timeline mirrored (read-only) from src/videos/manjhi/story.ts + cast.ts so every sound lands on
# the frame: shots, hammer hits, the wife's fall, the breakthrough. Manjhi is 41.796 s / 1254 f, not the bridge's
# 67.5 s — this module replaces timeline.py for the Manjhi build (dsp/sfx_gen/music building blocks are shared).
import json
import os

FPS = 30
TOTAL = 1254
DUR = 41.796            # voice.wav length, exactly
fr = lambda f: f / FPS

FLASH = fr(110)         # white flash after the hook (frame 110)
HITS = [1.0, 1.83, 2.67, 3.5, 10.33, 10.93, 11.53, 12.13, 15.9, 17.5, 19.0, 32.5, 33.17, 33.83]
FALL_T0, FALL_T1 = 23.9, 24.6   # the wife slips from the slope path, lands at the foot
BREAK_T = 33.83         # the breakthrough blow

# id: (first frame, end frame, light, crowd)
SHOTS = {
    1: (0, 112, "day", "hammer"), 2: (112, 302, "day", "village"), 3: (302, 377, "day", "climb"),
    4: (377, 460, "day", "laugh"), 5: (460, 583, "day", "years"), 6: (583, 670, "day", "crack"),
    7: (670, 799, "golden", "fall"), 8: (799, 882, "golden", "road"), 9: (882, 951, "golden", "kneel"),
    10: (951, 1045, "day", "break"), 11: (1045, 1120, "day", "walk"), 12: (1120, 1254, "golden", "payoff"),
}


def shot_t(i):
    a, b = SHOTS[i][:2]
    return fr(a), fr(b)


def shot_at(t):
    f = t * FPS
    for i, (a, b, *_r) in SHOTS.items():
        if a <= f < b:
            return i
    return 12


def words():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "words.json")) as f:
        return json.load(f)
