# -*- coding: utf-8 -*-
"""Generate MMM-branded SVG figures for the Pakistan open-source essay."""
import json, csv, math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "figures")
os.makedirs(OUT, exist_ok=True)

MONO = "'IBM Plex Mono', ui-monospace, monospace"
SERIF = "'Newsreader', Georgia, serif"
PAPER = "var(--paper-1, #f4f1ea)"
RULE  = "var(--paper-4, #ddd7c8)"
HAIR  = "var(--paper-3, #e5e0d3)"
INK1  = "var(--ink-1, #2e2b27)"
INK2  = "var(--ink-2, #3f3b35)"
INK4  = "var(--ink-4, #726c5e)"
INK5  = "var(--ink-5, #8c8578)"
INK7  = "var(--ink-7, #c0b8a5)"   # gridlines/ticks only — fails text contrast
COPPER = "#8a5a3b"

def esc(s):
    return (s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;"))

def head(w, h, title, sub):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{esc(title)}">
<rect width="{w}" height="{h}" fill="{PAPER}"/>
<text x="0" y="17" font-family="{SERIF}" font-size="15.5" font-weight="600" fill="{INK1}">{esc(title)}</text>
<text x="0" y="35" font-family="{MONO}" font-size="9.4" letter-spacing="0.055em" fill="{INK4}">{esc(sub.upper())}</text>'''

def save(name, body):
    p = os.path.join(OUT, name)
    open(p, "w").write(body + "\n</svg>")
    print("wrote", name)

# ---------------------------------------------------------------- data
panel = {r["iso"]: r for r in json.load(open("panel.json"))}
mit, devs = {}, {}
for row in csv.DictReader(open("/tmp/ig_licenses.csv")):
    if row["spdx_license"] == "MIT" and row["quarter"] == "1":
        mit[(row["iso2_code"], int(row["year"]))] = int(row["num_pushers"])
for row in csv.DictReader(open("/tmp/ig_dev.csv")):
    if row["quarter"] == "1":
        devs[(row["iso2_code"], int(row["year"]))] = int(row["developers"])

# ================================================================ FIG 1
# Denominator correction: per 100k population vs per 100k internet users
W, H = 760, 326
s = head(W, H, "Fig. 01 — The denominator does some of the work, but not all of it",
         "Unique developers pushing to MIT-licensed repositories, Q1 2026, per 100,000 people vs per 100,000 internet users")
L, T = 132, 62
plotw = 560
rows = [("Pakistan","PK"),("Bangladesh","BD"),("India","IN"),("Vietnam","VN")]
xmax = 25
def x1(v): return L + v/xmax*plotw
# gridlines
for g in range(0, xmax+1, 5):
    s += f'<line x1="{x1(g):.1f}" y1="{T}" x2="{x1(g):.1f}" y2="{T+4*52}" stroke="{HAIR}" stroke-width="1"/>'
    s += f'<text x="{x1(g):.1f}" y="{T+4*52+15}" font-family="{MONO}" font-size="9" fill="{INK4}" text-anchor="middle">{g}</text>'
for i,(nm,iso) in enumerate(rows):
    y = T + i*52
    r = panel[iso]
    bold = ' font-weight="600"' if iso=="PK" else ''
    s += f'<text x="{L-12}" y="{y+16}" font-family="{SERIF}" font-size="13.5" fill="{INK1}" text-anchor="end"{bold}>{nm}</text>'
    if iso != "PK":
        ratio_pop = panel[iso]["per100k_pop"]/panel["PK"]["per100k_pop"]
        ratio_usr = panel[iso]["per100k_users"]/panel["PK"]["per100k_users"]
        s += f'<text x="{L-12}" y="{y+30}" font-family="{MONO}" font-size="8.2" fill="{INK4}" text-anchor="end">{ratio_pop:.2f}× → {ratio_usr:.2f}× VS PK</text>'
    for j,(val,col) in enumerate([(r["per100k_pop"], INK5),(r["per100k_users"], COPPER)]):
        by = y + 2 + j*17
        s += f'<rect x="{L}" y="{by}" width="{max(x1(val)-L,1):.1f}" height="14" fill="{col}"/>'
        s += f'<text x="{x1(val)+6:.1f}" y="{by+11}" font-family="{MONO}" font-size="9.2" fill="{INK2}">{val:.1f}</text>'
s += f'<line x1="{L}" y1="{T+4*52}" x2="{L+plotw}" y2="{T+4*52}" stroke="{RULE}" stroke-width="1"/>'
s += f'<text x="{L+plotw/2}" y="{T+4*52+32}" font-family="{MONO}" font-size="8.6" letter-spacing="0.05em" fill="{INK4}" text-anchor="middle">CONTRIBUTORS PER 100,000</text>'
ly = H-12
s += f'<rect x="{L}" y="{ly-9}" width="11" height="11" fill="{INK5}"/><text x="{L+16}" y="{ly}" font-family="{MONO}" font-size="9" fill="{INK4}">per 100k population</text>'
s += f'<rect x="{L+170}" y="{ly-9}" width="11" height="11" fill="{COPPER}"/><text x="{L+186}" y="{ly}" font-family="{MONO}" font-size="9" fill="{INK4}">per 100k internet users</text>'
s += f'<text x="{W}" y="{ly}" font-family="{SERIF}" font-size="10" font-style="italic" fill="{INK4}" text-anchor="end">Estonia omitted (152.5 / 100k users) — off scale</text>'
save("fig-01-denominator.svg", s)
