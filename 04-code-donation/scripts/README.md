# Reproduction scripts

Run in order. They expect four primary files fetched into a working directory:

```bash
curl -o licenses.csv   https://raw.githubusercontent.com/github/innovationgraph/main/data/licenses.csv
curl -o developers.csv https://raw.githubusercontent.com/github/innovationgraph/main/data/developers.csv
curl -o sponsors.md    https://raw.githubusercontent.com/github/docs/main/content/sponsors/getting-started-with-github-sponsors/about-github-sponsors.md
# World Bank: country metadata, SP.POP.TOTL (2025), IT.NET.USER.ZS (2021-2024) via api.worldbank.org
```

Paths at the top of each script point at `/tmp` and at this folder's `figures/`
directory; adjust before re-running. `01` emits the economy panel, `02` prints the
significance tests and the Pakistan conversion series, `03`–`05` write the SVGs.

Data retrieved 19 September 2026, reflecting the GitHub Innovation Graph Q1 2026 release.
