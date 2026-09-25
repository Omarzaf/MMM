# -*- coding: utf-8 -*-
exec(open('mkfig.py').read().split('# ================================================================ FIG 1')[0])

# ================================================================ FIG 2
# Level vs growth
W,H = 760, 380
s = head(W,H,"Fig. 02 — Pakistan has the lowest level and the fastest growth in its peer set",
         "MIT-licensed contributors per 100,000 internet users (Q1 2026) against compound annual growth in contributors, Q1 2020 – Q1 2026")
L,T,PW,PH = 74, 66, 600, 232
pts = []
for iso,nm in [("PK","Pakistan"),("BD","Bangladesh"),("IN","India"),("VN","Vietnam"),("LK","Sri Lanka"),("NP","Nepal")]:
    cagr = (mit[(iso,2026)]/mit[(iso,2020)])**(1/6)-1
    pts.append((iso,nm,cagr*100,panel[iso]["per100k_users"]))
xlo,xhi,ylo,yhi = 26,42,0,50
def px(v): return L+(v-xlo)/(xhi-xlo)*PW
def py(v): return T+PH-(v-ylo)/(yhi-ylo)*PH
for g in range(30,50,10):
    s+=f'<line x1="{L}" y1="{py(g):.1f}" x2="{L+PW}" y2="{py(g):.1f}" stroke="{HAIR}"/>'
for g in range(0,51,10):
    s+=f'<text x="{L-10}" y="{py(g)+3.5:.1f}" font-family="{MONO}" font-size="9" fill="{INK4}" text-anchor="end">{g}</text>'
for g in range(26,43,4):
    s+=f'<line x1="{px(g):.1f}" y1="{T}" x2="{px(g):.1f}" y2="{T+PH}" stroke="{HAIR}"/>'
    s+=f'<text x="{px(g):.1f}" y="{T+PH+16}" font-family="{MONO}" font-size="9" fill="{INK4}" text-anchor="middle">{g}%</text>'
s+=f'<line x1="{L}" y1="{T+PH}" x2="{L+PW}" y2="{T+PH}" stroke="{RULE}"/>'
s+=f'<line x1="{L}" y1="{T}" x2="{L}" y2="{T+PH}" stroke="{RULE}"/>'
lab = {"PK":(0,-22),"BD":(0,-20),"IN":(0,-20),"VN":(0,-20),"LK":(0,-20),"NP":(0,-20)}
for iso,nm,cg,lv in pts:
    cx,cy = px(cg),py(lv)
    hl = iso=="PK"
    if hl: s+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="11" fill="{COPPER}" opacity="0.18"/>'
    s+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="{COPPER if hl else INK5}"/>'
    dx,dy = lab[iso]
    w = 'font-weight="600"' if hl else ''
    s+=f'<text x="{cx+dx:.1f}" y="{cy+dy:.1f}" font-family="{SERIF}" font-size="13" fill="{INK1}" text-anchor="middle" {w}>{nm}</text>'
    s+=f'<text x="{cx+dx:.1f}" y="{cy+dy+12:.1f}" font-family="{MONO}" font-size="8.2" fill="{INK4}" text-anchor="middle">{lv:.1f} / 100k · {cg:.0f}%/yr</text>'
s+=f'<text x="{L+PW/2}" y="{T+PH+34}" font-family="{SERIF}" font-size="11" font-style="italic" fill="{INK4}" text-anchor="middle">growth in MIT contributors, 2020–26 (CAGR)</text>'
s+=f'<text transform="translate(20,{T+PH/2}) rotate(-90)" font-family="{SERIF}" font-size="11" font-style="italic" fill="{INK4}" text-anchor="middle">MIT contributors per 100,000 internet users</text>'
s+=f'<text x="{L+PW}" y="{H-16}" font-family="{SERIF}" font-size="10" font-style="italic" fill="{INK4}" text-anchor="end">Estonia omitted: 152.5 / 100k users at 14.8%/yr — highest level, slowest growth.</text>'
save("fig-02-level-vs-growth.svg", s)

# ================================================================ FIG 3
# THE conversion rate — centrepiece
W,H = 760, 360
s = head(W,H,"Fig. 03 — The base grew 7.9×. The share of it contributing publicly did not move.",
         "Pakistan-located GitHub accounts and MIT-licensed contributors as a share of that base, first quarter of each year")
L,T,PW,PH = 74, 74, 600, 210
yrs = list(range(2020,2027))
accmax = 2_600_000
def by(v): return T+PH-v/accmax*PH
bw = PW/len(yrs)*0.52
for g in [0,500_000,1_000_000,1_500_000,2_000_000,2_500_000]:
    s+=f'<line x1="{L}" y1="{by(g):.1f}" x2="{L+PW}" y2="{by(g):.1f}" stroke="{HAIR}"/>'
    s+=f'<text x="{L-10}" y="{by(g)+3.5:.1f}" font-family="{MONO}" font-size="8.6" fill="{INK4}" text-anchor="end">{g//1000:,}k</text>'
# conversion axis
convs = [mit[("PK",y)]/devs[("PK",y)]*100 for y in yrs]
cmin,cmax = 0.40,1.00
def cy(v): return T+PH-(v-cmin)/(cmax-cmin)*PH
for i,y in enumerate(yrs):
    cx = L+(i+0.5)*PW/len(yrs)
    s+=f'<rect x="{cx-bw/2:.1f}" y="{by(devs[("PK",y)]):.1f}" width="{bw:.1f}" height="{T+PH-by(devs[("PK",y)]):.1f}" fill="{INK5}"/>'
    s+=f'<text x="{cx:.1f}" y="{T+PH+16}" font-family="{MONO}" font-size="9" fill="{INK4}" text-anchor="middle">{y}</text>'
# 2020 reference line
s+=f'<line x1="{L}" y1="{cy(convs[0]):.1f}" x2="{L+PW}" y2="{cy(convs[0]):.1f}" stroke="{INK5}" stroke-width="1" stroke-dasharray="3 3"/>'
s+=f'<text x="{L+8}" y="{cy(convs[0])-6:.1f}" font-family="{MONO}" font-size="8.2" fill="{INK4}">2020 CONVERSION RATE 0.60%</text>'
path = " ".join(f'{"M" if i==0 else "L"}{L+(i+0.5)*PW/len(yrs):.1f},{cy(c):.1f}' for i,c in enumerate(convs))
s+=f'<path d="{path}" fill="none" stroke="{COPPER}" stroke-width="2"/>'
for i,c in enumerate(convs):
    cx = L+(i+0.5)*PW/len(yrs)
    s+=f'<circle cx="{cx:.1f}" cy="{cy(c):.1f}" r="3.6" fill="{COPPER}"/>'
    dy = -10 if i in (1,5,6) else 16
    s+=f'<text x="{cx:.1f}" y="{cy(c)+dy:.1f}" font-family="{MONO}" font-size="9" fill="{COPPER}" text-anchor="middle">{c:.2f}%</text>'
s+=f'<line x1="{L}" y1="{T+PH}" x2="{L+PW}" y2="{T+PH}" stroke="{RULE}"/>'
s+=f'<text x="{L}" y="{T-10}" font-family="{SERIF}" font-size="11" font-style="italic" fill="{INK4}">GitHub accounts (bars)</text>'
s+=f'<text x="{L+PW}" y="{T-10}" font-family="{SERIF}" font-size="11" font-style="italic" fill="{COPPER}" text-anchor="end">conversion rate (line)</text>'
s+=f'<text x="{L}" y="{H-16}" font-family="{SERIF}" font-size="10.5" font-style="italic" fill="{INK4}">0.60% in 2020. 0.57% in 2026. Sevenfold growth in the base has not changed the share that contributes publicly.</text>'
save("fig-03-conversion-rate.svg", s)
