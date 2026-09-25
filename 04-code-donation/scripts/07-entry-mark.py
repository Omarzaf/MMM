# -*- coding: utf-8 -*-
"""Entry mark for 'Code Donation' — the argument as one Voyager-style diagram.

Seven concentric rings, one per year, radius scaled so AREA is proportional to
Pakistan's GitHub account base. On each ring a copper arc subtends that year's
conversion rate at a fixed scale of 1% = 90 degrees. The rings grow eightfold.
The arc does not move. Line geometry only, per the series diagram rules.
"""
import math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "figures")
MONO = "'IBM Plex Mono', ui-monospace, monospace"
SERIF = "'Newsreader', Georgia, serif"
PAPER = "var(--paper-1, #f4f1ea)"
INK1  = "var(--ink-1, #2e2b27)"
INK4  = "var(--ink-4, #726c5e)"
INK5  = "var(--ink-5, #8c8578)"
INK7  = "var(--ink-7, #c0b8a5)"
COPPER = "#8a5a3b"

YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026]
ACC   = [317224, 470394, 656514, 924871, 1303816, 1718562, 2497496]
CONV  = [0.60, 0.91, 0.58, 0.53, 0.51, 0.56, 0.57]
DEG_PER_PCT = 90.0

W, H = 760, 470
CX, CY = 380, 236
RMAX = 186

def pt(r, deg):
    a = math.radians(deg)
    return CX + r*math.cos(a), CY + r*math.sin(a)

def arc(r, start, sweep, colour, width):
    x1, y1 = pt(r, start)
    x2, y2 = pt(r, start + sweep)
    large = 1 if sweep > 180 else 0
    return (f'<path d="M{x1:.2f},{y1:.2f} A{r:.2f},{r:.2f} 0 {large},1 {x2:.2f},{y2:.2f}" '
            f'fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="butt"/>')

radii = [RMAX * math.sqrt(a/ACC[-1]) for a in ACC]

s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
     f'role="img" aria-label="Entry mark: seven concentric rings, one per year from 2020 to 2026, '
     f'sized so area tracks Pakistan’s GitHub account base. A copper arc on each ring shows that '
     f'year’s open-source conversion rate. The rings grow eightfold; the arc stays the same width.">',
     f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']

# outer tick ring — the series' Voyager language
TICK_R = RMAX + 15
for i in range(36):
    d = i*10
    x1, y1 = pt(TICK_R, d); x2, y2 = pt(TICK_R + (7 if i % 3 == 0 else 4), d)
    s.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{INK7}" stroke-width="0.75"/>')

# the anchor spoke every copper arc starts from
ax, ay = pt(RMAX + 8, -90)
s.append(f'<line x1="{CX}" y1="{CY}" x2="{ax:.2f}" y2="{ay:.2f}" stroke="{INK7}" stroke-width="0.75" stroke-dasharray="2 4"/>')

# measuring spoke, lower left
sx, sy = pt(RMAX + 8, 135)
s.append(f'<line x1="{CX}" y1="{CY}" x2="{sx:.2f}" y2="{sy:.2f}" stroke="{INK7}" stroke-width="0.75"/>')

for r, y, c in zip(radii, YEARS, CONV):
    s.append(f'<circle cx="{CX}" cy="{CY}" r="{r:.2f}" fill="none" stroke="{INK5}" stroke-width="0.75"/>')
    s.append(arc(r, -90, c*DEG_PER_PCT, COPPER, 2.4))
    tx, ty = pt(r, 135)
    s.append(f'<circle cx="{tx:.2f}" cy="{ty:.2f}" r="1.6" fill="{INK5}"/>')
    if y in (2020, 2023, 2026):
        lx, ly = pt(r - 9, 143)   # nudged off the spoke so the rule stays unbroken
        s.append(f'<text x="{lx:.2f}" y="{ly:.2f}" font-family="{MONO}" font-size="9" '
                 f'fill="{INK4}" text-anchor="end" dominant-baseline="middle">{y}</text>')

s.append(f'<circle cx="{CX}" cy="{CY}" r="4" fill="none" stroke="{INK1}" stroke-width="1.2"/>')

# the two readings, set against the mark
s.append(f'<text x="28" y="40" font-family="{MONO}" font-size="9.4" letter-spacing="0.055em" fill="{INK4}">THE BASE, 2020 → 2026</text>')
s.append(f'<text x="28" y="62" font-family="{SERIF}" font-size="21" fill="{INK1}">7.87×</text>')
s.append(f'<text x="{W-28}" y="40" font-family="{MONO}" font-size="9.4" letter-spacing="0.055em" fill="{INK4}" text-anchor="end">THE SHARE THAT GAVE IT AWAY</text>')
s.append(f'<text x="{W-28}" y="62" font-family="{SERIF}" font-size="21" fill="{COPPER}" text-anchor="end">0.60% → 0.57%</text>')

s.append(f'<text x="{CX}" y="{H-34}" font-family="{MONO}" font-size="9" letter-spacing="0.05em" '
         f'fill="{INK4}" text-anchor="middle">RING AREA ∝ GITHUB ACCOUNTS · COPPER ARC ∝ CONVERSION RATE AT 1% = 90°</text>')
s.append(f'<text x="{CX}" y="{H-16}" font-family="{SERIF}" font-size="11" font-style="italic" '
         f'fill="{INK4}" text-anchor="middle">The rings grow eightfold. The arc does not move.</text>')

s.append('</svg>')
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "entry-mark-code-donation.svg"), "w").write("\n".join(s) + "\n")
print("wrote entry-mark-code-donation.svg")
print("radii:", " ".join(f"{r:.0f}" for r in radii))
print("arc sweeps (deg):", " ".join(f"{c*DEG_PER_PCT:.0f}" for c in CONV))
