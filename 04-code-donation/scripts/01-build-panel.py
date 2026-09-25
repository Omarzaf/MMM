import csv, json, re, statistics as st

# ---- Sponsors supported regions -> ISO2 ----
txt = open('/tmp/sponsors.md').read()
regions = [r.strip() for r in re.findall(r'<li>(.*?)</li>', txt)]
assert len(regions) == 103

wb = json.load(open('/tmp/wb_countries.json'))[1]
wb = [r for r in wb if r['region']['value'] != 'Aggregates']
by_name = {r['name'].lower(): r['iso2Code'] for r in wb}
income = {r['iso2Code']: r['incomeLevel']['value'] for r in wb}
name = {r['iso2Code']: r['name'] for r in wb}
region = {r['iso2Code']: r['region']['value'] for r in wb}

manual = {
 "Antigua & Barbuda":"AG","Bosnia & Herzegovina":"BA","Côte d'Ivoire":"CI","Czech Republic":"CZ",
 "Egypt":"EG","Gambia":"GM","Hong Kong SAR":"HK","Macao SAR":"MO","Moldova":"MD","North Macedonia":"MK",
 "Russia":"RU","Slovakia":"SK","South Korea":"KR","St. Lucia":"LC","Trinidad & Tobago":"TT",
 "Turkey":"TR","United Kingdom":"GB","United States":"US","Venezuela":"VE","Vietnam":"VN",
 "Gibraltar":"GI","Tanzania":"TZ","Iran":"IR","Kyrgyzstan":"KG","Laos":"LA","Syria":"SY","Yemen":"YE",
}
elig = set()
unresolved = []
for r in regions:
    iso = manual.get(r) or by_name.get(r.lower())
    if not iso:
        cand = [k for k in by_name if r.lower() in k or k in r.lower()]
        iso = by_name[cand[0]] if len(cand) == 1 else None
    if iso: elig.add(iso)
    else: unresolved.append(r)
print("resolved eligible ISO2:", len(elig), "| unresolved:", unresolved)

# ---- GitHub Innovation Graph, Q1 2026 ----
mit, devs = {}, {}
for row in csv.DictReader(open('/tmp/ig_licenses.csv')):
    if row['spdx_license']=='MIT' and row['year']=='2026' and row['quarter']=='1':
        mit[row['iso2_code']] = int(row['num_pushers'])
for row in csv.DictReader(open('/tmp/ig_dev.csv')):
    if row['year']=='2026' and row['quarter']=='1':
        devs[row['iso2_code']] = int(row['developers'])

# ---- World Bank ----
pop = {r['countryiso3code']: r['value'] for r in json.load(open('/tmp/wb_pop.json'))[1] if r['value']}
net_raw = {}
for r in json.load(open('/tmp/wb_net.json'))[1]:
    if r['value'] is None: continue
    k = r['countryiso3code']; y = int(r['date'])
    if k not in net_raw or y > net_raw[k][0]: net_raw[k] = (y, r['value'])
iso3 = {r['iso2Code']: r['id'] for r in wb}

rows = []
for c, m in mit.items():
    i3 = iso3.get(c)
    if not i3 or i3 not in pop or i3 not in net_raw: continue
    P, (ny, npct) = pop[i3], net_raw[i3]
    users = P * npct/100
    rows.append(dict(iso=c, name=name.get(c,c), mit=m, devs=devs.get(c),
                     pop=P, netpct=npct, netyear=ny,
                     per100k_pop=m/P*1e5, per100k_users=m/users*1e5,
                     eligible=c in elig, income=income.get(c,'?'), region=region.get(c,'?')))
print("economies with full data:", len(rows))
json.dump(rows, open('panel.json','w'), indent=1)

def summarise(sel, label):
    e=[r['per100k_users'] for r in sel if r['eligible']]
    n=[r['per100k_users'] for r in sel if not r['eligible']]
    if not e or not n: return
    print(f"\n{label}  (eligible n={len(e)}, ineligible n={len(n)})")
    print(f"   median MIT per 100k internet users: eligible {st.median(e):7.1f} | ineligible {st.median(n):7.1f}  ratio {st.median(e)/st.median(n):.2f}x")
    print(f"   mean                              : eligible {st.mean(e):7.1f} | ineligible {st.mean(n):7.1f}")

summarise(rows, "ALL ECONOMIES")
for band in ["High income","Upper middle income","Lower middle income","Low income"]:
    summarise([r for r in rows if r['income']==band], band.upper())

print("\n--- INELIGIBLE ECONOMIES, ranked by MIT per 100k internet users ---")
for r in sorted([r for r in rows if not r['eligible']], key=lambda x:-x['per100k_users']):
    print(f"   {r['name'][:26]:<26} {r['per100k_users']:8.1f}  (pop {r['pop']/1e6:8.1f}m, {r['income']})")

print("\n--- LOWER-MIDDLE-INCOME, ranked ---")
for r in sorted([r for r in rows if r['income']=='Lower middle income'], key=lambda x:-x['per100k_users']):
    tag = "ELIGIBLE  " if r['eligible'] else "ineligible"
    print(f"   {tag} {r['name'][:24]:<24} {r['per100k_users']:8.1f}  (pop {r['pop']/1e6:7.1f}m)")
