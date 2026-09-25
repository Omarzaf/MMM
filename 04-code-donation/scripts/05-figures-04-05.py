# -*- coding: utf-8 -*-
import statistics as st
exec(open('mkfig.py').read().split('# ================================================================ FIG 1')[0])
rows_all = json.load(open("panel.json"))

# ================================================================ FIG 4
# The honest test: strip plot of lower-middle-income economies
W,H = 760, 320
s = head(W,H,"Fig. 05 — Among Pakistan\u2019s income peers, Sponsors eligibility does not separate the field",
         "MIT contributors per 100,000 internet users, Q1 2026 \u2014 all lower-middle-income economies in the dataset")
L,PW = 108, 596
xmax = 36
def X(v): return L+v/xmax*PW
lmi = [r for r in rows_all if r["income"]=="Lower middle income"]
elig = sorted([r for r in lmi if r["eligible"]], key=lambda r:r["per100k_users"])
inel = sorted([r for r in lmi if not r["eligible"]], key=lambda r:r["per100k_users"])
TOPY, BOTY = 130, 218
for g in range(0,xmax+1,5):
    s+=f'<line x1="{X(g):.1f}" y1="86" x2="{X(g):.1f}" y2="254" stroke="{HAIR}"/>'
    s+=f'<text x="{X(g):.1f}" y="270" font-family="{MONO}" font-size="9" fill="{INK4}" text-anchor="middle">{g}</text>'
s+=f'<line x1="{L}" y1="254" x2="{L+PW}" y2="254" stroke="{RULE}"/>'
# only well-separated labels, alternating above/below the axis line
LBL_E = {"Kenya":-1, "India":-1, "Nigeria":1, "Senegal":-1}
LBL_I = {"Nepal":-1, "Bangladesh":1, "Pakistan":-1, "Tajikistan":1}
def strip(items, y, colour, tag, n, labels):
    out  = f'<text x="{L-14}" y="{y-3}" font-family="{MONO}" font-size="9" letter-spacing="0.05em" fill="{INK4}" text-anchor="end">{tag}</text>'
    out += f'<text x="{L-14}" y="{y+10}" font-family="{MONO}" font-size="8.2" fill="{INK4}" text-anchor="end">n={n}</text>'
    out += f'<line x1="{L}" y1="{y}" x2="{L+PW}" y2="{y}" stroke="{HAIR}" stroke-width="1"/>'
    med = st.median([r["per100k_users"] for r in items])
    out += f'<line x1="{X(med):.1f}" y1="{y-30}" x2="{X(med):.1f}" y2="{y+30}" stroke="{colour}" stroke-width="1.5" stroke-dasharray="4 3"/>'
    out += f'<text x="{X(med)+5:.1f}" y="{y-34}" font-family="{MONO}" font-size="8.4" fill="{colour}">MEDIAN {med:.1f}</text>'
    for r in items:
        cx = X(r["per100k_users"]); hl = r["name"]=="Pakistan"
        out += f'<circle cx="{cx:.1f}" cy="{y}" r="{6 if hl else 4.6}" fill="{colour}" fill-opacity="{1 if hl else 0.58}" stroke="{PAPER}" stroke-width="0.9"/>'
    for nm,d in labels.items():
        r = next((x for x in items if x["name"]==nm), None)
        if not r: continue
        cx = X(r["per100k_users"]); hl = nm=="Pakistan"
        ty = y-14 if d<0 else y+21
        out += f'<line x1="{cx:.1f}" y1="{y+(-7 if d<0 else 7)}" x2="{cx:.1f}" y2="{y+(-11 if d<0 else 11)}" stroke="{INK5}" stroke-width="1"/>'
        w = ' font-weight="600"' if hl else ''
        out += f'<text x="{cx:.1f}" y="{ty}" font-family="{SERIF}" font-size="11.5" fill="{INK1}" text-anchor="middle"{w}>{esc(nm)}</text>'
    return out
s += strip(elig, TOPY, COPPER, "ELIGIBLE", len(elig), LBL_E)
s += strip(inel, BOTY, INK5,   "NOT ELIGIBLE", len(inel), LBL_I)
s+=f'<text x="{L+PW/2}" y="288" font-family="{SERIF}" font-size="11" font-style="italic" fill="{INK4}" text-anchor="middle">MIT contributors per 100,000 internet users</text>'
s+=f'<text x="{L}" y="{H-12}" font-family="{SERIF}" font-size="10.5" font-style="italic" fill="{INK4}">Medians 9.6 vs 7.6. Mann\u2013Whitney U = 153, two-sided p = 0.32 \u2014 not distinguishable from noise.</text>'
save("fig-05-eligibility-test.svg", s)

# ================================================================ FIG 5
# The confound
W,H = 760, 300
s = head(W,H,"Fig. 04 — The headline eligibility gap is an income gap",
         "Median MIT contributors per 100,000 internet users, eligible vs ineligible economies, by World Bank income group")
L,T,PW,PH = 150, 74, 520, 160
bands = [("All economies", [r for r in rows_all]),
         ("High income", [r for r in rows_all if r["income"]=="High income"]),
         ("Upper middle income", [r for r in rows_all if r["income"]=="Upper middle income"]),
         ("Lower middle income", [r for r in rows_all if r["income"]=="Lower middle income"])]
vmax = 85
def X2(v): return L+v/vmax*PW
rh = PH/len(bands)
for g in range(0,vmax+1,20):
    s+=f'<line x1="{X2(g):.1f}" y1="{T}" x2="{X2(g):.1f}" y2="{T+PH}" stroke="{HAIR}"/>'
    s+=f'<text x="{X2(g):.1f}" y="{T+PH+16}" font-family="{MONO}" font-size="9" fill="{INK4}" text-anchor="middle">{g}</text>'
for i,(nm,sel) in enumerate(bands):
    y = T+i*rh
    e = st.median([r["per100k_users"] for r in sel if r["eligible"]])
    n = st.median([r["per100k_users"] for r in sel if not r["eligible"]])
    s+=f'<text x="{L-12}" y="{y+16}" font-family="{SERIF}" font-size="12.5" fill="{INK1}" text-anchor="end">{nm}</text>'
    s+=f'<text x="{L-12}" y="{y+29}" font-family="{MONO}" font-size="8.2" fill="{INK4}" text-anchor="end">RATIO {e/n:.2f}×</text>'
    for j,(v,c) in enumerate([(e,COPPER),(n,INK5)]):
        byy = y+3+j*15
        s+=f'<rect x="{L}" y="{byy}" width="{max(X2(v)-L,1):.1f}" height="12" fill="{c}"/>'
        s+=f'<text x="{X2(v)+6:.1f}" y="{byy+9.6}" font-family="{MONO}" font-size="8.8" fill="{INK2}">{v:.1f}</text>'
s+=f'<line x1="{L}" y1="{T+PH}" x2="{L+PW}" y2="{T+PH}" stroke="{RULE}"/>'
ly = H-36
s+=f'<rect x="{L}" y="{ly-9}" width="11" height="11" fill="{COPPER}"/><text x="{L+16}" y="{ly}" font-family="{MONO}" font-size="9" fill="{INK4}">eligible for Sponsors</text>'
s+=f'<rect x="{L+180}" y="{ly-9}" width="11" height="11" fill="{INK5}"/><text x="{L+196}" y="{ly}" font-family="{MONO}" font-size="9" fill="{INK4}">not eligible</text>'
s+=f'<text x="{L}" y="{H-14}" font-family="{SERIF}" font-size="10.5" font-style="italic" fill="{INK4}">The 4.0× gap across all economies falls to 1.3× inside Pakistan’s own income band, and reverses at high income.</text>'
save("fig-04-income-confound.svg", s)
