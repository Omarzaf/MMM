# Meaning, Man and Model

A series by Umar Zafar. I build projects with AI, and write about what happens along the way: where the model is useful, where it isn't, and what that says about the people using it.

This repository holds every published entry and the research behind it, one folder per entry, so anyone can check the work. Each folder has the article as published, the data and sources it rests on, and the code that produced its figures, where there is any.

## Entries

| No. | Entry | Kind | Read it | Folder |
| --- | --- | --- | --- | --- |
| I | The Makkah Pact: Can a Treaty Deter War Without Starting One? | Essay | [live](https://meaning-man-and-model.vercel.app/makkah-pact.html) | [`01-makkah-pact/`](01-makkah-pact/) |
| II | Virality without an industry | Project | [live](https://meaning-man-and-model.vercel.app/virality-without-an-industry.html) | [`02-virality-without-an-industry/`](02-virality-without-an-industry/) |
| III | Pakistan’s AI policy is becoming infrastructure. Almost none of it can be shown to run. | Project | [live](https://meaning-man-and-model.vercel.app/pakistan-ai-policy-observatory.html) | [`03-pakistan-ai-policy-observatory/`](03-pakistan-ai-policy-observatory/) |
| IV | Code Donation: the situation of Pakistan’s open-source community | Essay | [live](https://umarzafar.vercel.app/code-donation.html) | [`04-code-donation/`](04-code-donation/) |

- **I — The Makkah Pact.** A game-theory reading of the Saudi–Pakistani–Turkish defence agreement, and why deterrence needs room to fail. The folder holds the essay and the two background research reports it drew on.
- **II — Virality without an industry.** Pakistan can now measure musical reach far better than it can measure musicians' livelihoods. The folder holds the research design: codebooks, a proposition matrix, a source map, an annotated bibliography, and the interview, fieldwork and ethics protocols. It also holds the code that builds the page.
- **III — The Pakistan AI Policy Observatory.** Fifteen days of verified records on Pakistan's AI and digital-infrastructure policy, placed on a lifecycle ladder and scored for evidence. The folder holds the full evidence package: 52 records, 111 assessed sources, the briefing corpus, the Word report, the Excel register and the generator with its 45 release checks.
- **IV — Code Donation.** Pakistan built every input to an open-source economy except the one that pays for it. The folder holds the essay, a 140-economy panel, the figure scripts and the original research memo.

## How to review an entry

1. Read the entry's `README.md` first. It lists every file and what it is for.
2. Read the article. Use the live link, or open the HTML in the entry's `article/` folder in a browser. Entry III's article is its `index.html`.
3. Check a claim against its data. Each entry keeps its sources and datasets beside the article, and the READMEs point to the file behind each figure.
4. Reproduce it, if you want. The entries with code say how to rebuild their outputs and run their checks.

Corrections and challenges are welcome as GitHub issues. Please name the entry, the claim, and the evidence you think contradicts it.

## Licensing and rights

- **Entry III** carries explicit licences. Its research content and derived data are under CC BY 4.0 ([`03-pakistan-ai-policy-observatory/LICENSE`](03-pakistan-ai-policy-observatory/LICENSE)), and its code in `tools/` is under MIT ([`tools/LICENSE`](03-pakistan-ai-policy-observatory/tools/LICENSE)).
- **Entries I, II and IV** do not have a licence yet. They are published here to be read, checked and cited; all other rights are reserved by the author until a licence is added.
- **Third-party material** keeps its own terms. That covers the government pages, reports, datasets and photographs that the entries cite or show. Photograph credits and licences for Entry II are in [`assets/hiphop-pakistan/manifest.json`](02-virality-without-an-industry/assets/hiphop-pakistan/manifest.json).

## What is not in this repository

Drafts of entries that have not been published, and internal design, QA and planning notes, are left out.
