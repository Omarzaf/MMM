import json, csv, itertools, random, statistics as st
rows = json.load(open('panel.json'))
by = {r['iso']: r for r in rows}

print("=== FOCAL SET, MIT pushers per 100k (Q1 2026) ===")
for c in ['PK','BD','IN','VN','EE','LK','NP','CN','TW','ID','PH']:
    r = by.get(c)
    if r: print(f"  {r['name'][:20]:<20} pop {r['per100k_pop']:7.2f} | users {r['per100k_users']:7.1f} | net {r['netpct']:.1f}% ({r['netyear']}) | {'ELIGIBLE' if r['eligible'] else 'ineligible'}")

def mannwhitney(a, b, iters=200000):
    """Exact-ish U test via permutation; returns U, two-sided p."""
    n1, n2 = len(a), len(b)
    comb = sorted(a + b)
    def U(x, y):
        return sum((xi > yi) + 0.5*(xi == yi) for xi in x for yi in y)
    u_obs = U(a, b)
    pooled = a + b
    cnt = 0
    rng = random.Random(42)
    for _ in range(iters):
        rng.shuffle(pooled)
        if abs(U(pooled[:n1], pooled[n1:]) - n1*n2/2) >= abs(u_obs - n1*n2/2):
            cnt += 1
    return u_obs, cnt/iters

for band in ["Lower middle income", "Upper middle income"]:
    sel = [r for r in rows if r['income'] == band]
    a = [r['per100k_users'] for r in sel if r['eligible']]
    b = [r['per100k_users'] for r in sel if not r['eligible']]
    u, p = mannwhitney(a, b, 20000)
    print(f"\n=== {band} (eligible n={len(a)}, ineligible n={len(b)}) ===")
    print(f"  median eligible {st.median(a):.1f} vs ineligible {st.median(b):.1f}")
    print(f"  Mann-Whitney U = {u:.1f}, permutation two-sided p = {p:.3f}")
    print(f"  -> {'DISTINGUISHABLE from noise at 0.05' if p < 0.05 else 'NOT distinguishable from noise at 0.05'}")

# Pakistan conversion series
mit, devs = {}, {}
for row in csv.DictReader(open('/tmp/ig_licenses.csv')):
    if row['spdx_license']=='MIT' and row['quarter']=='1' and row['iso2_code']=='PK':
        mit[int(row['year'])] = int(row['num_pushers'])
for row in csv.DictReader(open('/tmp/ig_dev.csv')):
    if row['quarter']=='1' and row['iso2_code']=='PK':
        devs[int(row['year'])] = int(row['developers'])
print("\n=== PAKISTAN: base vs conversion, Q1 of each year ===")
for y in sorted(devs):
    if y in mit:
        print(f"  {y}  accounts {devs[y]:>9,}   MIT {mit[y]:>6,}   conversion {mit[y]/devs[y]*100:.2f}%")
b0,b1 = devs[2020], devs[2026]
print(f"  base growth {b1/b0:.2f}x | MIT growth {mit[2026]/mit[1 and 2020]:.2f}x")
print(f"  accounts CAGR {((b1/b0)**(1/6)-1)*100:.1f}% | MIT CAGR {((mit[2026]/mit[2020])**(1/6)-1)*100:.1f}%")

print("\n=== peer MIT CAGR 2020Q1->2026Q1 ===")
m20, m26 = {}, {}
for row in csv.DictReader(open('/tmp/ig_licenses.csv')):
    if row['spdx_license']=='MIT' and row['quarter']=='1':
        if row['year']=='2020': m20[row['iso2_code']] = int(row['num_pushers'])
        if row['year']=='2026': m26[row['iso2_code']] = int(row['num_pushers'])
for c in ['PK','IN','BD','VN','EE','LK','NP']:
    if c in m20 and c in m26:
        print(f"  {by.get(c,{}).get('name',c)[:16]:<16} {m20[c]:>7,} -> {m26[c]:>7,}  CAGR {((m26[c]/m20[c])**(1/6)-1)*100:5.1f}%")
