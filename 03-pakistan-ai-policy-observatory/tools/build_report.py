#!/usr/bin/env python3
"""Build the verified Pakistan AI policy monitoring report as a styled DOCX."""

from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from lxml import etree


ROOT = Path(__file__).resolve().parent.parent
INTERMEDIATE = ROOT / "intermediate"
OUTPUT_DIR = ROOT / "outputs" / "01a0653c-96d7-7c92-918b-3975d6716164"
OUTPUT_DOCX = OUTPUT_DIR / "Pakistan_AI_Policy_and_Digital_Infrastructure_Verified_15-Day_Monitoring_Report_2026-08-18_to_2026-09-03_UTC.docx"
REFERENCE_DOCX = INTERMEDIATE / "report_reference.docx"
REPORT_MARKDOWN = INTERMEDIATE / "report_source.md"
AUTHOR = "Muhammad Umar Zafar"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
DC_NS = "http://purl.org/dc/elements/1.1/"
CP_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DCTERMS_NS = "http://purl.org/dc/terms/"
NS = {"w": W_NS, "r": R_NS}


def qn(namespace: str, tag: str) -> str:
    """Return an expanded XML qualified name."""

    return f"{{{namespace}}}{tag}"


def read_csv(path: Path) -> list[dict[str, str]]:
    """Read a UTF-8 CSV file into dictionaries."""

    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def run(command: list[str]) -> None:
    """Run a command and fail with useful output."""

    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}\n"
            f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )


def markdown_cell(value: Any) -> str:
    """Escape a compact value for a Markdown pipe table cell."""

    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def compact_briefings(refs: list[str]) -> str:
    """Format briefing provenance without implying corroboration."""

    if not refs:
        return "Not captured in B001–B014"
    return ", ".join(refs)


def build_markdown(dataset: dict[str, Any]) -> str:
    """Compose the complete report source from the curated evidence model."""

    events = {item["event_id"]: item for item in [*dataset["events"], *dataset["baselines"]]}
    sources = {item["source_id"]: item for item in dataset["sources"]}
    inventory = read_csv(INTERMEDIATE / "dataset_inventory.csv")
    units = read_csv(INTERMEDIATE / "briefing_units.csv")
    gaps = read_csv(INTERMEDIATE / "coverage_gaps.csv")
    source_url_rows = read_csv(INTERMEDIATE / "source_url_index.csv")
    similarities = read_csv(INTERMEDIATE / "unit_similarity.csv")

    def source_links(item: dict[str, Any]) -> str:
        ids = [*item["primary_source_ids"], *item["corroborating_source_ids"]]
        return ", ".join(f"[{sid}]({sources[sid]['url']})" for sid in ids)

    def citation(event_id: str) -> str:
        item = events[event_id]
        return f"[Briefing provenance: {compact_briefings(item['briefing_refs'])}; external evidence: {source_links(item)}]"

    def event_card(event_id: str) -> str:
        item = events[event_id]
        lines = [
            f"### {item['event_id']} · {item['normalized_event_title']}",
            "",
            f"**Date / owner / scope.** {item['event_date']} · {item['institution']} · {item['geography']}.",
            "",
            f"**Verified status.** {item['status_stage']}.",
            "",
            f"**Verified development.** {item['verified_facts']} {citation(event_id)}",
        ]
        if item.get("source_claims"):
            lines.extend(["", f"**Source claim requiring qualification.** {item['source_claims']}"])
        lines.extend(
            [
                "",
                f"**Change in the period.** {item['what_changed']}",
                "",
                f"**Significance and analysis.** {item['significance']} {item['analytical_interpretation']}",
                "",
                f"**Confidence.** {item['confidence']} — {item['confidence_reason']}",
                "",
                f"**Forward checks.** {item['forward_implications']}",
                "",
                f"**Unresolved.** {item['unresolved_issues']}",
                "",
            ]
        )
        return "\n".join(lines)

    section_groups = {
        "6": [
            "BASE-AIPOL-20250730-31",
            "BASE-AIBILL-20240909",
            "EVT-PROC-20260827-PTA-DIRBS",
            "EVT-PUNJAB-20260902-AUQAF-AI",
        ],
        "7": [
            "BASE-DGP-20260626",
            "BASE-PDP-2023-2026",
            "BASE-PISF-20260810-11",
            "BASE-DNP-WASL-20260426-0513",
            "EVT-REG-20260821-PVARA",
            "EVT-CYB-20260824-PKCERT16",
            "EVT-CYB-20260824-PKCERT17",
            "EVT-TEL-20260828-AMENDMENT-WITHDRAWN",
            "EVT-KP-20260821-DIGITAL-PAYMENTS",
            "EVT-KP-20260827-VIRTUAL-WORKPLACE",
            "EVT-SECP-20260827-C19",
            "EVT-PLAT-20260901-PUNJAB-U16",
            "EVT-PLAT-20260831-IHC-U16",
            "EVT-INTL-20260901-SAUDI-NCA-CYBER-MOU",
            "EVT-INTL-20260901-SAUDI-SDAIA-AI-DATA",
        ],
        "8": [
            "EVT-GOOG-20260818-OFFICE",
            "BASE-GOOG-20260801-COMMERCIAL",
            "EVT-GOOG-20260821-MOU",
        ],
        "9": [
            "BASE-ETDC-20260618-25",
            "BASE-NAIEDP-20260625",
            "BASE-SOVAI-RFP-20260724",
            "BASE-PITB-AICLOUD-20260731",
            "BASE-PITB-DC11",
            "BASE-PITB-DC02",
            "BASE-PITB-ITOPS23",
            "BASE-SKY47-20260724-KARAKORAM01",
            "EVT-PROC-20260820-NADRA-RACKS",
            "EVT-PROC-20260820-NADRA-SWITCHES",
            "EVT-TEL-20260827-JAZZ-5G",
            "EVT-TEL-20260821-25-FAB-MONITORING",
            "EVT-INF-20260821-SKY47-COMMERCE",
        ],
        "10": [
            "EVT-PROC-20260818-31-AI-HUBS",
            "EVT-PROC-20260819-MOITT-TRAINING",
            "EVT-PROC-20260821-28-NAVTTC-AI-SERVICES",
            "EVT-PROC-20260828-WHO-BALOCHISTAN-GIS",
            "EVT-PART-20260827-RESECURITY-SKY47",
            "EVT-RD-20260829-PSEB-NED",
            "EVT-PUNJAB-20260828-HUAWEI",
            "EVT-PUNJAB-20260830-ALIBABA",
            "EVT-KP-20260828-WORLDBANK-DIGITAL-ENERGY",
            "EVT-INTL-20260901-SAUDI-CLOUD-MEETING",
            "EVT-DPI-20260901-OPEN-STACK",
            "EVT-PUNJAB-20260902-PTUT-AI-COURSES",
        ],
        "11": [
            "EVT-ID-20260901-NADRA-FBISE",
            "EVT-PUNJAB-20260828-DATALAKE",
            "EVT-KP-20260828-DIGITAL-DELIVERY",
            "EVT-PUNJAB-20260902-PBTE-DIGITISATION",
        ],
        "13": ["BASE-FINTECH-SUMMIT"],
    }
    assigned = [event_id for group in section_groups.values() for event_id in group]
    if len(assigned) != len(set(assigned)):
        raise RuntimeError("A report event is assigned to more than one detailed section")
    if set(assigned) != set(events):
        missing = sorted(set(events) - set(assigned))
        extra = sorted(set(assigned) - set(events))
        raise RuntimeError(f"Report coverage mismatch. Missing={missing}; extra={extra}")

    in_period_confidence = defaultdict(int)
    for item in dataset["events"]:
        in_period_confidence[item["confidence"]] += 1
    all_confidence = defaultdict(int)
    for item in events.values():
        all_confidence[item["confidence"]] += 1

    page_break = "```{=openxml}\n<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>\n```"
    cover = f"""```{{=openxml}}
<w:p><w:pPr><w:spacing w:before="2640" w:after="200"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="C28B32"/><w:smallCaps/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:spacing w:val="24"/></w:rPr><w:t>RESEARCH BRIEF</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="260"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:r><w:rPr><w:color w:val="203748"/><w:b/><w:sz w:val="60"/><w:szCs w:val="60"/></w:rPr><w:t>Pakistan AI Policy and Digital Infrastructure</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="200"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="2B5163"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr><w:t>Verified 15-Day Monitoring Report</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="280"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="C28B32"/><w:sz w:val="22"/></w:rPr><w:t>━━━━━━━━━━</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="203748"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>18 August–3 September 2026 (UTC)</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="80"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="65727A"/><w:sz w:val="20"/></w:rPr><w:t>{len(units)} supplied briefing units · {len(dataset['sources'])} external sources assessed</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="80"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="65727A"/><w:sz w:val="20"/></w:rPr><w:t>Search cutoff: 3 September 2026, 04:15 UTC</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:before="1000"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="7B858A"/><w:i/><w:sz w:val="18"/></w:rPr><w:t>Comprehensive within the supplied dataset and documented searches; not an exhaustive census of public events.</w:t></w:r></w:p>
```"""

    lines: list[str] = [
        cover,
        page_break,
        "# Contents",
        "",
        "1. Executive summary",
        "2. Scope and research questions",
        "3. Dataset and coverage audit",
        "4. Methodology",
        "5. Key findings",
        "6. AI policy, regulation, and public-sector adoption",
        "7. Data protection, digital regulation, and cybersecurity",
        "8. Google in Pakistan",
        "9. AI and digital infrastructure",
        "10. Programs, funding, investment, and workforce",
        "11. Provincial and local developments",
        "12. Cross-cutting analysis and implications",
        "13. Unverified, disputed, or insufficiently supported claims",
        "14. Gaps and limitations",
        "15. Watchlist",
        "16. Conclusion",
        "17. Sources",
        "",
        "Appendix A. Methodology and audit detail",
        page_break,
        "# 1. Executive summary",
        "",
        "This report is comprehensive with respect to the supplied briefing files and documented verification searches; it cannot prove that every relevant public event was captured. The monitored corpus is materially incomplete: 14 briefing units were available against a nominal 1,440 expected runs for exactly 15 days at a 15-minute cadence. The observed UTC span was 18 August 2026 19:24 through 3 September 2026 02:21, but the strict briefing windows covered only 215.82 minutes—0.98% of that span.",
        "",
        "> **Bottom line.** Pakistan’s verified record in this window is one of institutional scaffolding: binding sector rules and final financial-process guidance sit alongside a much larger field of tenders, evaluations, MoUs, meetings, targets and authority-reported systems whose implementation is not yet independently evidenced.",
        "",
        f"The curated register contains {len(dataset['events'])} in-period or verification-discovered records and {len(dataset['baselines'])} carry-in or disputed context baselines. Across all {len(events)} records, confidence is High for {all_confidence['High']}, Medium for {all_confidence['Medium']} and Low for {all_confidence['Low']}; within the {len(dataset['events'])} event records, the distribution is {in_period_confidence['High']} High, {in_period_confidence['Medium']} Medium and {in_period_confidence['Low']} Low. Confidence attaches to the stated lifecycle claim—not to eventual delivery.",
        "",
        f"The clearest binding change was notification of PVARA’s virtual-asset regulations on 21 August, including concrete cyber, cloud, cross-border, algorithm, record-retention and incident-reporting duties {citation('EVT-REG-20260821-PVARA')}. SECP Circular 19/2026 was also verified as a final issued instrument, setting measurable individual-account decision periods and a three-month transition, although it states no express effective date {citation('EVT-SECP-20260827-C19')}.",
        "",
        f"Google’s Pakistan record is bifurcated. A prime-ministerial plaque ceremony and government/company office language are verified, but no premises-level record establishes a staffed operational Google office with a street address, occupancy, mandate or local hosting {citation('EVT-GOOG-20260818-OFFICE')}. Separately, Google’s own advertising guidance verifies a limited local commercial/tax counterparty role for specified products and account types {citation('BASE-GOOG-20260801-COMMERCIAL')}. Corporate/tax presence is not physical-office evidence.",
        "",
        f"Infrastructure evidence was mostly upstream: tenders, final evaluations, planning recommendations and exploratory meetings. A July Sky47 inauguration provides the strongest physical data-centre baseline, while its reported 8.5 MW remains a facility-level figure with no independently verified IT load, GPU inventory, customer use or utilisation {citation('BASE-SKY47-20260724-KARAKORAM01')}. The in-period Commerce meeting did not create that capacity {citation('EVT-INF-20260821-SKY47-COMMERCE')}.",
        "",
        f"The corpus missed at least one consequential event: the Saudi National Cybersecurity Authority and Pakistan’s MoITT signed a cybersecurity MoU on 1 September, verified by Saudi and Pakistani official sources but absent from B001–B014 {citation('EVT-INTL-20260901-SAUDI-NCA-CYBER-MOU')}. This demonstrates why missing briefings cannot be treated as evidence of no event.",
        "",
        "## Decision-useful conclusions",
        "",
        "- **For government bodies:** publish operative instruments, workplans, budgets, data maps, acceptance tests and performance measures; press-release status language is not enough for accountable implementation.",
        "- **For companies and investors:** distinguish strategic policy opportunity from bankable procurement or commissioned capacity; verify award, contract, release, site, power, cooling, connectivity and customer-use evidence.",
        "- **For researchers and civil society:** maintain event-level provenance; prioritize privacy, surveillance, age assurance, biometrics, model function, redress and auditability as data integration expands.",
        "- **For Google-specific analysis:** keep corporate registration, tax counterparty, hiring, partner programmes, temporary presence, physical office, Cloud region and owned data centre as separate evidence classes.",
        "",
        "# 2. Scope and research questions",
        "",
        "The review covers material developments in Pakistan concerning AI policy, regulation, safety, procurement and public-sector adoption; data protection, privacy, governance, localisation and cross-border transfers; cybersecurity, identity, platforms and telecommunications; compute, cloud, data centres, connectivity and energy dependencies; public programmes, tenders, investment, workforce and international agreements; and Google’s reported office, physical presence, programmes, hiring and regulatory position.",
        "",
        "The central questions were:",
        "",
        "1. What materially changed during the observed period, and who owned the change?",
        "2. Which developments were legally effective, finally issued, approved, signed, tendered, evaluated, merely announced, contradicted or operational?",
        "3. What money, capacity, deadlines or obligations can be stated without inference?",
        "4. Which stakeholders are affected, and what implementation or governance evidence is still missing?",
        "5. What does the verified event set—not briefing repetition—show about the direction of Pakistan’s AI and digital-infrastructure agenda?",
        "",
        "The temporal frame is the actual observed span, 18 August 2026 19:24 UTC through 3 September 2026 02:21 UTC. “15-day” is retained as the requested monitoring label; it is not a claim that the corpus supplies continuous coverage for exactly 15 days.",
        "",
        "# 3. Dataset and coverage audit",
        "",
        "## Inventory result",
        "",
        "| Measure | Result | Interpretation |",
        "|---|---:|---|",
        "| Top-level files | 13 | Flat directory; no nested folders or standalone archives |",
        "| Briefing source files | 12 | 11 DOCX files plus one Markdown bundle |",
        "| Briefing units | 14 | The Markdown bundle contains three labelled tabs |",
        "| Non-briefing files | 1 | Readable music-economy HTML; excluded for lack of material nexus |",
        "| Unreadable or malformed briefings | 0 | All 11 DOCX containers were valid OOXML ZIPs |",
        "| Exact duplicate files | 0 groups | SHA-256 comparison |",
        "| Normalized full-text duplicate units | 0 | Repeated claims were clustered at event level |",
        "| Expected runs, exactly 15 days | 1,440 | 15 days × 24 hours × four runs/hour |",
        "| Observed units | 14 | 0.97% of the nominal 1,440 |",
        "| Nominal missing units | 1,426 | Missing intervals were not imputed |",
        "| Strict observed window time | 215.82 min | 0.98% of the 22,017-minute observed span |",
        "",
        "> **Coverage verdict.** The files are readable and internally auditable, but temporally sparse. They resemble daily or near-daily exports rather than a continuous 15-minute archive.",
        "",
        "All 13 inter-briefing gaps exceeded 30 minutes. They ranged from 1,412 minutes (23h32m) to 2,578.83 minutes (42h58m50s). Across the 22,017-minute observed span, approximately 1,468 15-minute runs would be expected; approximately 1,454 are absent. Nominal title dates omit 19 and 24 August; normalized PKT windows omit 24 August and 2 September.",
        "",
        "## Timestamp and timezone findings",
        "",
        "Explicit internal UTC/PKT coverage windows were treated as authoritative. Filename dates/times and filesystem timestamps were discovery metadata only. B001’s title date is UTC while its PKT date is 19 August; B006’s filename is 25 August PKT while its UTC window is 24 August; B012–B014 use ET/EDT filenames that do not exactly match internal cutoffs. The eleven DOCX core creation/modification timestamps all carry the stale template value 23 December 2013 and were discarded as chronology evidence.",
        "",
        "# 4. Methodology",
        "",
        "The briefing corpus was treated as a secondary discovery index, never as independent corroboration. Extraction produced normalized records with event ID, date, institution, geography, status language, figures, briefing provenance, source URLs, lifecycle, confidence and unresolved questions. Repeated coverage was clustered into one underlying event unless a later source established a genuine lifecycle update, correction or supersession.",
        "",
        "Verification followed a source hierarchy: operative Pakistani law and Gazette text, parliamentary/court/procurement/budget records, ministries and regulators; direct company, university, investor and international-institution publications; credible reporting; commentary only for context. Original pages or documents were opened and assessed. For consequential claims, a second independent source was sought where available. When two government or news pages repeated the same handout, they were not counted as independent corroboration.",
        "",
        "Lifecycle language was preserved. A proposal is not approval; approval is not effectiveness; an open or closed tender is not evaluation; final evaluation is not award; a contract or MoU is not commissioning; inauguration is not verified IT load or utilisation; an authority-reported operating system is not an independent assurance audit. Event and publication dates were kept separate, and contradictions were reported rather than silently resolved.",
        "",
        "Confidence rubric:",
        "",
        "- **High:** an accessible primary record supports the event and its stated lifecycle; material contradictions are resolved or explicitly bounded.",
        "- **Medium:** the core event is supported, but the instrument, implementation evidence, independent corroboration or important particulars are missing.",
        "- **Low:** support is indirect, secondary, inaccessible or contradictory; no provision-level or implementation conclusion is drawn.",
        "",
        "The search cutoff was 3 September 2026 at 04:15 UTC. Full extraction, deduplication, conflict and reproducibility rules appear in Appendix A.",
        "",
        page_break,
        "# 5. Key findings",
        "",
        "| Finding | Verified change | Decision implication |",
        "|---|---|---|",
        f"| Sector regulation | PVARA notified two effective virtual-asset regulations on 21 August {citation('EVT-REG-20260821-PVARA')} | Compliance programmes need concrete cloud, cyber, algorithm, record and incident controls |",
        f"| Financial regulation | SECP issued Circular 19/2026 with onboarding deadlines and a transition period {citation('EVT-SECP-20260827-C19')} | Track commencement clarification and actual intermediary compliance |",
        f"| Google | Ceremony and local-office claim verified; physical operation unverified; limited commercial/tax role verified separately {citation('EVT-GOOG-20260818-OFFICE')} {citation('BASE-GOOG-20260801-COMMERCIAL')} | Avoid converting corporate/tax presence into premises, staffing or hosting claims |",
        f"| Compute | ETDC remains CDWP-recommended and PSDP-allocated; sovereign infrastructure remains an open RFP {citation('BASE-ETDC-20260618-25')} {citation('BASE-SOVAI-RFP-20260724')} | No new public usable AI capacity can be counted from planning or tender records |",
        f"| Procurement | AI Hubs closed pre-evaluation; MoITT/NAVTTC reached final evaluation; WHO remained an open amended RFP {citation('EVT-PROC-20260818-31-AI-HUBS')} {citation('EVT-PROC-20260819-MOITT-TRAINING')} {citation('EVT-PROC-20260821-28-NAVTTC-AI-SERVICES')} {citation('EVT-PROC-20260828-WHO-BALOCHISTAN-GIS')} | The delivery funnel is active but mostly pre-award |",
        f"| International | Saudi NCA–MoITT cybersecurity MoU signed; cloud and SDAIA dialogues remain separate exploratory records {citation('EVT-INTL-20260901-SAUDI-NCA-CYBER-MOU')} {citation('EVT-INTL-20260901-SAUDI-CLOUD-MEETING')} {citation('EVT-INTL-20260901-SAUDI-SDAIA-AI-DATA')} | Do not collapse adjacent diplomatic meetings into one instrument |",
        f"| Provincial delivery | Punjab and KP reported data, cyber and service initiatives, but independent operational metrics were largely absent {citation('EVT-PUNJAB-20260828-DATALAKE')} {citation('EVT-KP-20260828-DIGITAL-DELIVERY')} | Require architecture, budgets, data maps, acceptance and outcome evidence |",
        "| Monitor quality | 14 observed units versus 1,440 nominally expected; a major Saudi MoU was missed | Negative findings are bounded and importance cannot be inferred from mention frequency |",
        "",
        "The verified event set supports a cautious conclusion: policy and institutional channels are advancing, but implementation proof remains the scarce asset. The detailed records below state development, status, date/owner, evidence, change, significance, confidence and forward checks for each included event or interpretive baseline.",
        "",
        "# 6. AI policy, regulation, and public-sector adoption",
        "",
        "Pakistan’s AI policy remains a strategic baseline rather than a demonstrated delivery mechanism. In-period public-sector evidence ranges from a closed AI consultancy tender to an authority-labelled AI-assisted monitoring system. The former has not reached award; the latter lacks technical and rights-assurance artefacts.",
        "",
    ]
    lines.extend(event_card(event_id) for event_id in section_groups["6"])
    lines.extend(
        [
            "# 7. Data protection, digital regulation, and cybersecurity",
            "",
            "The legal picture is fragmented. Binding movement occurred in sector-specific virtual-asset regulation and investor onboarding, while horizontal data protection and the national data-governance policy remained unverified as final law/policy. Cyber guidance and international cooperation advanced, but operational outcomes and information-sharing safeguards remain largely unpublished.",
            "",
        ]
    )
    lines.extend(event_card(event_id) for event_id in section_groups["7"])
    lines.extend(
        [
            "# 8. Google in Pakistan",
            "",
            "> **Evidence rule for this section.** Corporate/tax registration, a commercial counterparty, a representative or programme presence, hiring, a partner-operated facility, an announced intention and a staffed operational office are separate facts. A Cloud region and an owned data centre are separate again.",
            "",
            "The strongest defensible formulation is: Pakistan and Google marked an announced local-office/corporate-presence milestone at Prime Minister House on 18 August, and Google separately operates a defined local ads counterparty for specified accounts; premises, staffing, mandate and local hosting remain unverified.",
            "",
        ]
    )
    lines.extend(event_card(event_id) for event_id in section_groups["8"])
    lines.extend(
        [
            "# 9. AI and digital infrastructure",
            "",
            "The infrastructure record must be read as a lifecycle stack: planning recommendation → budget allocation → tender → evaluation → award → contract → delivery → acceptance → commissioned capacity → utilised workload. The available evidence occupies many upstream stages but rarely the last three.",
            "",
        ]
    )
    lines.extend(event_card(event_id) for event_id in section_groups["9"])
    lines.extend(
        [
            "# 10. Programs, funding, investment, and workforce",
            "",
            "Programmes and partnerships produced the densest event flow, but numeric targets should not be read as achieved beneficiaries or committed capital. Contract values, disbursement, curricula, sites and accepted outputs were frequently absent.",
            "",
        ]
    )
    lines.extend(event_card(event_id) for event_id in section_groups["10"])
    lines.extend(
        [
            "# 11. Provincial and local developments",
            "",
            "Punjab generated the densest announcement cluster; KP combined an administrative directive with self-reported delivery claims. Provincial experimentation is consequential because data integration, monitoring and citizen services create immediate governance burdens even when federal horizontal privacy legislation remains unverified.",
            "",
        ]
    )
    lines.extend(event_card(event_id) for event_id in section_groups["11"])
    lines.extend(
        [
            "# 12. Cross-cutting analysis and implications",
            "",
            "## 12.1 Lifecycle inflation is the main analytical risk",
            "",
            "Announcements, meetings, MoUs, tenders, evaluations, contracts and operational systems are often adjacent in public language, but they transfer different levels of authority, money and delivery risk. The most reliable reading is stage-specific. PVARA is notified regulation; SECP is an issued circular with an unstated effective date; the Saudi cyber record is a signed MoU; PSEB–NED and FAB are contracts; AI Hubs and WHO are procurements; Huawei, Alibaba and KP–World Bank are announcements or exploratory mechanisms. None of these labels is interchangeable.",
            "",
            "## 12.2 Governance is lagging integration",
            "",
            "Public-sector identity, education, geospatial, financial, health and monitoring initiatives expand data linkage while a final national Data Governance Policy and enacted horizontal personal-data law remain unverified. Sector rules partly fill the gap—PVARA on virtual assets, SECP on onboarding, PISF on covered government/CII security—but they do not create a uniform rights, lawful-basis, transfer, retention and redress framework across all systems.",
            "",
            "## 12.3 Compute is inseparable from energy and connectivity",
            "",
            "A data-centre announcement does not establish AI capacity. Decision-grade evidence requires at least the site, gross and IT load, power source and redundancy, cooling, network paths, hardware/GPU inventory, commissioning, customers and utilisation. KP–World Bank talks acknowledged power/transmission dependencies, but Huawei, Alibaba and sovereign-infrastructure records did not disclose quantified energy commitments for the discussed capacity.",
            "",
            "## 12.4 Vendor dependence needs exit and assurance terms",
            "",
            "Google, Huawei, Alibaba, Sky47, Resecurity and technology-procurement records all raise questions about data location, subcontractors, access controls, audit rights, portability, continuity and exit. Those questions become more important where signed texts, architecture and accepted-delivery records are not public.",
            "",
            "## 12.5 Provincial innovation increases comparative-governance needs",
            "",
            "Punjab and KP are moving through different mixes of data platforms, service centres, monitoring, skills, cyber response and infrastructure partnership. Common reporting fields—budget, legal basis, controller/processor roles, procurement stage, security testing, uptime, usage, complaints and outcomes—would make provincial claims comparable and reduce press-release dependence.",
            "",
            "## 12.6 The monitor’s own missingness is substantive evidence",
            "",
            "The briefing archive’s sparsity is not merely a documentation inconvenience. Because an independently verified Saudi cybersecurity MoU fell inside the observed period but outside all supplied briefings, the study cannot use “no item found” as a confident claim of no event. Future monitoring should retain each scheduled run, record failed searches and preserve source snapshots or hashes where permitted.",
            "",
            "## Stakeholder implications",
            "",
            "| Stakeholder | Immediate implication | Evidence threshold to request |",
            "|---|---|---|",
            "| Federal and provincial bodies | Translate announcements into accountable delivery records | Instrument, budget/release, procurement, data map, acceptance, service metrics |",
            "| Regulators | Clarify commencement, scope and enforcement | Gazette/circular text, guidance, licence/decision register, supervisory outcomes |",
            "| Companies and investors | Price stage and dependency risk | Contract, site, power/network, capacity, milestones, customer use, exit rights |",
            "| Researchers and universities | Separate institutional agreements from research/training outcomes | Contract, lab readiness, intake, completion, placements, publications and IP terms |",
            "| Users and civil society | Focus on rights at system level | Lawful basis, minimisation, retention, accuracy, access, correction, appeal and audit |",
            "",
            "# 13. Unverified, disputed, or insufficiently supported claims",
            "",
            "The following claims were not promoted beyond the evidence available:",
            "",
            "- **Google operational office:** official and company-linked language says office, but premises and operation remain unverified.",
            "- **KP Digital Payments Bill passage:** the official tracker says referred to committee; a press headline says approved while its body says introduced.",
            "- **Punjab under-16 social-media resolution:** one credible report, no official text; a resolution is not legislation.",
            "- **IHC under-16 matter:** procedural reporting aligns, but the authenticated order was not located.",
            "- **PITB AI cloud/GPU identities:** mutable listings and conflicting dates prevent safe aggregation of tender quantities or status.",
            "- **Gomal University data centre and RDA portal:** briefing-level references lacked direct artefacts or acceptance evidence.",
            "- **Date-only X-access claim:** no primary PTA/Interior notice was located and the claim conflicted with earlier reporting.",
            "- **General grid work:** excluded where no dedicated AI-compute energy nexus was evidenced.",
            "",
        ]
    )
    lines.extend(event_card(event_id) for event_id in section_groups["13"])
    lines.extend(
        [
            "## Material exclusion log",
            "",
        ]
    )
    for row in dataset["exclusions"]:
        lines.append(
            f"- **{markdown_cell(row['item_id'])} — {markdown_cell(row['item'])}.** "
            f"Type: {markdown_cell(row['type'])}. Reason: {markdown_cell(row['reason'])} "
            f"Disposition: {markdown_cell(row['disposition'])}."
        )
    lines.extend(
        [
            "",
            "# 14. Gaps and limitations",
            "",
            "The dominant limitation is temporal coverage: only 14 units were supplied, all 13 gaps exceed 30 minutes, and strict windows cover less than 1% of the observed span. Missing intervals were not imputed and cannot support a no-event inference.",
            "",
            "Several official sources are mutable registers or press releases rather than signed instruments. Some primary records were scanned or did not state an effective date. Court orders, MoUs, procurement contracts, commencement certificates, technical architectures, security reviews, data maps and acceptance tests were often unavailable. Company and authority operational claims were not treated as independent audits. Second-source corroboration was sometimes impossible, and multiple outlets sometimes repeated the same handout.",
            "",
            "Negative findings—no Act located, no ECNEC approval found, no Google Pakistan location in company directories—are bounded to the registers and pages checked at the cutoff. Absence from a directory is evidence of the directory state, not proof of metaphysical nonexistence.",
            "",
            "This report is therefore comprehensive only with respect to the supplied dataset and documented verification searches. It is neither a total archive nor proof that every relevant public event was captured.",
            "",
            "# 15. Watchlist",
            "",
            "| Trigger | Topic | Verification task |",
            "|---|---|---|",
        ]
    )
    for item in dataset["watchlist"]:
        lines.append(
            f"| {markdown_cell(item['date_or_trigger'])} | "
            + (f"[{markdown_cell(item['watch_id'])} · {markdown_cell(item['topic'])}]({item['source_url']})" if item.get('source_url') else f"{markdown_cell(item['watch_id'])} · {markdown_cell(item['topic'])}")
            + (f" [{markdown_cell(item['source_id'])}]" if item.get('source_id') else " [no source captured]")
            + " | "
            f"{markdown_cell(item['what_to_verify'])} |"
        )
    lines.extend(
        [
            "",
            "# 16. Conclusion",
            "",
            "The verified record shows acceleration in Pakistan’s AI and digital-governance agenda, but not a clean transition from policy to operation. Binding movement is clearest in PVARA’s notified regulations and SECP’s final onboarding circular. Infrastructure and workforce movement is visible in planning records, tenders, evaluations, contracts and exploratory partnerships, while commissioning, audited capacity and outcome evidence remain thinner.",
            "",
            "Google’s Pakistan position is commercially and politically more concrete than before, yet the evidence does not establish a staffed physical office or local Cloud/data-centre presence. Provincial systems and international engagements broaden the agenda while raising unresolved questions about legal basis, data flows, energy, security, audit and exit.",
            "",
            "The next evidence threshold is implementation: operative instruments, appropriations and releases, contracts, sites, technical specifications, data safeguards, acceptance tests and measured outputs. Until those appear, the strongest report is not the most expansive one; it is the one that keeps every stage legible.",
            "",
            "# 17. Sources",
            "",
            "Source IDs are used throughout the report and match the evidence register. Publication and event dates remain separate. “Live” indicates a mutable register captured at the access cutoff; any availability exception is stated in the source entry.",
            "",
            "## Briefing provenance",
            "",
            "| ID | Source file / subunit | Window (UTC) | Timing note |",
            "|---|---|---|---|",
        ]
    )
    for unit in units:
        lines.append(
            f"| {unit['briefing_id']} | {markdown_cell(unit['source_file'])} — {markdown_cell(unit['source_subunit'])} | "
            f"{unit['window_start_utc']} to {unit['window_end_utc']} | {markdown_cell(unit['timing_issues'])} |"
        )
    lines.extend(["", "## External source register", ""])
    for item in dataset["sources"]:
        dates = []
        if item.get("publication_date"):
            if item["publication_date"] == "live":
                dates.append("live register at cutoff")
            else:
                dates.append(f"published {item['publication_date']}")
        if item.get("event_date"):
            dates.append(f"event {item['event_date']}")
        date_text = "; ".join(dates) if dates else "date not stated"
        availability = str(item.get("availability", "")).strip()
        availability_text = (
            f" Availability: {availability}."
            if availability and availability != "opened and assessed"
            else ""
        )
        lines.append(
            f"- **[{item['source_id']}]({item['url']})** — {item['publisher']}. “{item['document_title']}.” "
            f"{date_text}. Type: {item['source_type']}.{availability_text} Limitation: {item['limitations']}"
        )
    lines.extend(
        [
            "",
            page_break,
            "# Appendix A. Methodology and audit detail",
            "",
            "## A.1 Files received and processed",
            "",
            "| File ID | Format | Bytes | Units | Decision |",
            "|---|---:|---:|---:|---|",
        ]
    )
    for index, row in enumerate(inventory, start=1):
        lines.append(
            f"| F{index:03d} | {row['format']} | {row['bytes']} | "
            f"{row['apparent_briefing_units']} | {markdown_cell(row['inclusion_decision'])} |"
        )
    lines.extend(
        [
            "",
            "All 11 DOCX packages were readable OOXML ZIPs and contained no unsafe package-member paths. The Markdown file produced three distinct labelled briefing units. The unrelated HTML file was readable but excluded. No files were unreadable, malformed, exact hash duplicates or normalized full-text duplicates.",
            "",
            "### File hashes and apparent coverage",
            "",
            "The full inventory is retained in `intermediate/dataset_inventory.csv`. The portable audit values used here are:",
            "",
        ]
    )
    for index, row in enumerate(inventory, start=1):
        apparent_coverage = markdown_cell(row["apparent_coverage_utc"]) or "not applicable"
        lines.append(
            f"- **F{index:03d} — {markdown_cell(row['source_file'])}** — apparent coverage: {apparent_coverage}; "
            f"SHA-256: `{row['sha256']}`."
        )
    lines.extend(
        [
            "",
            "## A.2 Expected versus observed temporal coverage",
            "",
            "Exactly 15 days at a nominal 15-minute cadence yields 1,440 expected runs. Fourteen units were observed, leaving 1,426 nominally absent. The actual observed span is 22,017 minutes; at the same cadence it contains approximately 1,468 expected slots, of which approximately 1,454 are absent. The observed units represent about 0.95% of those slots, and their strict coverage windows total 215.82 minutes (0.98% of span time).",
            "",
            "| From | To | Gap start (UTC) | Gap end (UTC) | Minutes | Approx. absent 15m runs |",
            "|---|---|---|---|---:|---:|",
        ]
    )
    for row in gaps:
        gap_start = row["gap_start_utc"].replace("T", " ").replace("Z", " UTC")
        gap_end = row["gap_end_utc"].replace("T", " ").replace("Z", " UTC")
        lines.append(
            f"| {row['from_briefing']} | {row['to_briefing']} | {gap_start} | "
            f"{gap_end} | {row['gap_minutes']} | {row['approximate_missing_15m_runs']} |"
        )
    max_similarity = max((float(row["five_word_shingle_jaccard"]) for row in similarities), default=0.0)
    lines.extend(
        [
            "",
            "## A.3 Timestamp and timezone normalization",
            "",
            "Explicit internal UTC and PKT windows governed chronology. PKT is UTC+05:00. ET filenames were interpreted in the context of daylight time but not used to override explicit UTC cutoffs. Approximate or reconstructed endpoints remain labelled. Filesystem birth/modification timestamps reflect download handling, while DOCX core timestamps are stale template metadata and were rejected.",
            "",
            "## A.4 Extraction method",
            "",
            f"The extraction pass normalized 14 briefing units and indexed {len(source_url_rows)} URL references. Each candidate was captured with its event/claim, responsible institution or company, geography, claimed date, first/last appearance, URLs, evidence language, status, figures and topic. Curated records then added legal/procurement lifecycle, external sources, confidence, unresolved issues and inclusion decision.",
            "",
            "## A.5 Deduplication and clustering",
            "",
            f"Exact SHA-256 identity was tested at file level. Whole-unit normalized text and shingle similarity were tested at briefing-unit level; the maximum pairwise shingle Jaccard score was {max_similarity:.4f}, and no normalized full-text duplicates were found. At claim level, repeated headlines and recurring baselines were clustered around one underlying event. A later item became a new record only where it changed lifecycle, timing, terms or evidence—not merely because it appeared again.",
            "",
            "Classifications used: exact duplicate; repeated coverage; genuine update; correction; distinct event; contradicted/unresolved; baseline carry-in; future watch; excluded/out of scope.",
            "",
            "## A.6 Inclusion and exclusion criteria",
            "",
            "Included records required a material Pakistan nexus and relevance to AI policy/governance, data protection/governance, cybersecurity, identity/DPI, platform/telecom regulation, compute/cloud/data centres, connectivity/energy resilience, procurement/programme delivery, investment/partnerships, workforce/research, or Google’s Pakistan presence. Pre-period baselines were retained only when necessary to interpret in-period claims. Generic global stories, generic procurement, unrelated grid works and claims without a material Pakistan/digital nexus were excluded. Unsupported items were retained in the exclusion or watchlist log rather than promoted.",
            "",
            "## A.7 Source hierarchy and verification procedure",
            "",
            "1. Pakistani laws, Gazette texts, parliamentary and court records, procurement and budget records, ministries and regulators.",
            "2. Direct company, university, investor and international-institution publications.",
            "3. Credible Pakistani and international news organisations.",
            "4. Commentary only for context.",
            "",
            "Original sources were opened rather than inferred from snippets. Publisher, title, URL, publication date, event date, access date and limitations were recorded. Second sources were sought for major claims. A second page repeating the same handout was labelled non-independent. Inaccessible, undated, mutable or contradictory evidence was disclosed.",
            "",
            "## A.8 Treatment of conflict",
            "",
            "Conflicts were preserved. The KP Digital Payments tracker and press coverage disagree; Google office language is stronger than premises evidence; ETDC sources conflict on the 18/25 June CDWP date; WHO publication is 24 August in B006 but 28 August on the current mutable page, which retains superseded deadlines; PVARA’s summary-page ten-year statement is narrower in operative text. No preferred version was silently substituted.",
            "",
            "## A.9 Confidence and analytical assumptions",
            "",
            "Confidence refers to the claim as written. High confidence in a signed MoU does not imply high confidence in delivery. Core assumptions were: announcements are not implementation; tender close is not award; final evaluation is not contract; contract is not commissioning; budget allocation is not release or expenditure; inauguration is not accepted IT load or utilisation; commercial/tax counterparty is not physical office; and company-reported footprint is not independent performance validation.",
            "",
            "## A.10 Known limitations and search cutoff",
            "",
            "Known limitations include severe missing intervals, mutable public registers, inaccessible signed instruments, absent authenticated court orders, limited independent operational audits and missing technical/data-protection artefacts. Current web verification was bounded at **3 September 2026, 04:15 UTC**. Any later register or procurement change falls outside this report.",
            "",
            "## A.11 Reproducibility",
            "",
            "Run the three Node scripts and follow `intermediate/REPRODUCIBILITY.md`; it names the CSV/JSON checks and source-refresh sequence. Keep missing intervals missing and never count repeated briefings as independent corroboration.",
        ]
    )
    return "\n".join(lines).strip() + "\n"


def first_or_create(parent: etree._Element, tag: str) -> etree._Element:
    """Find or append one WordprocessingML child."""

    element = parent.find(f"w:{tag}", NS)
    if element is None:
        element = etree.SubElement(parent, qn(W_NS, tag))
    return element


def set_attr(element: etree._Element, name: str, value: str) -> None:
    """Set a WordprocessingML attribute."""

    element.set(qn(W_NS, name), value)


def patch_style(
    styles_root: etree._Element,
    style_id: str,
    *,
    size: int | None = None,
    color: str | None = None,
    bold: bool | None = None,
    italic: bool | None = None,
    align: str | None = None,
    before: int | None = None,
    after: int | None = None,
    line: int | None = None,
    keep_next: bool = False,
) -> None:
    """Apply paragraph/run formatting to an existing reference style."""

    style = styles_root.find(f".//w:style[@w:styleId='{style_id}']", NS)
    if style is None:
        return
    ppr = first_or_create(style, "pPr")
    rpr = first_or_create(style, "rPr")
    fonts = first_or_create(rpr, "rFonts")
    for key in ("ascii", "hAnsi", "eastAsia", "cs"):
        set_attr(fonts, key, "Calibri")
    if size is not None:
        set_attr(first_or_create(rpr, "sz"), "val", str(size))
        set_attr(first_or_create(rpr, "szCs"), "val", str(size))
    if color is not None:
        set_attr(first_or_create(rpr, "color"), "val", color)
    if bold:
        first_or_create(rpr, "b")
    if italic:
        first_or_create(rpr, "i")
    if align is not None:
        set_attr(first_or_create(ppr, "jc"), "val", align)
    spacing = first_or_create(ppr, "spacing")
    if before is not None:
        set_attr(spacing, "before", str(before))
    if after is not None:
        set_attr(spacing, "after", str(after))
    if line is not None:
        set_attr(spacing, "line", str(line))
        set_attr(spacing, "lineRule", "auto")
    if keep_next:
        first_or_create(ppr, "keepNext")


# ECMA-376 Part 2 defines CT_CoreProperties as an ordered xs:sequence, so a
# missing element has to be inserted at its position rather than appended, or
# the package can become unreadable.
CORE_PROPERTY_ORDER = (
    qn(CP_NS, "category"),
    qn(CP_NS, "contentStatus"),
    qn(DCTERMS_NS, "created"),
    qn(DC_NS, "creator"),
    qn(DC_NS, "description"),
    qn(DC_NS, "identifier"),
    qn(CP_NS, "keywords"),
    qn(DC_NS, "language"),
    qn(CP_NS, "lastModifiedBy"),
    qn(CP_NS, "lastPrinted"),
    qn(DCTERMS_NS, "modified"),
    qn(CP_NS, "revision"),
    qn(DC_NS, "subject"),
    qn(DC_NS, "title"),
    qn(CP_NS, "version"),
)


def _normalise_core_property_order(core) -> None:
    """Reorder cp:coreProperties children into the schema's xs:sequence.

    Inserting relative to existing siblings is not enough, because the input may
    already be out of order - the reference DOCX shipped with cp:lastModifiedBy
    after dcterms:modified. Sorting every known child fixes the element being
    added and any pre-existing violation in the same pass. Unknown children keep
    their relative order at the end.
    """

    rank = {tag: index for index, tag in enumerate(CORE_PROPERTY_ORDER)}
    children = list(core)
    ordered = sorted(
        enumerate(children),
        key=lambda pair: (rank.get(pair[1].tag, len(CORE_PROPERTY_ORDER)), pair[0]),
    )
    for element in children:
        core.remove(element)
    for _, element in ordered:
        core.append(element)


def set_core_properties(members: dict[str, bytes], title_text: str) -> None:
    """Set publication-safe title and authorship metadata in a DOCX package."""

    if "docProps/core.xml" not in members:
        return
    core = etree.fromstring(members["docProps/core.xml"])
    for tag, value in (
        (qn(DC_NS, "title"), title_text),
        (qn(DC_NS, "creator"), AUTHOR),
        (qn(CP_NS, "lastModifiedBy"), AUTHOR),
    ):
        element = core.find(tag)
        if element is None:
            element = etree.SubElement(core, tag)
        element.text = value
    _normalise_core_property_order(core)
    members["docProps/core.xml"] = etree.tostring(
        core,
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )


def patch_reference_docx(path: Path) -> None:
    """Apply the standard business brief reference styles."""

    with zipfile.ZipFile(path, "r") as archive:
        members = {info.filename: archive.read(info.filename) for info in archive.infolist()}
    styles_root = etree.fromstring(members["word/styles.xml"])

    defaults = styles_root.find("w:docDefaults", NS)
    if defaults is not None:
        rpr_default = defaults.find("w:rPrDefault/w:rPr", NS)
        if rpr_default is not None:
            fonts = first_or_create(rpr_default, "rFonts")
            for key in ("ascii", "hAnsi", "eastAsia", "cs"):
                set_attr(fonts, key, "Calibri")
            set_attr(first_or_create(rpr_default, "sz"), "val", "22")
            set_attr(first_or_create(rpr_default, "szCs"), "val", "22")
        ppr_default = defaults.find("w:pPrDefault/w:pPr", NS)
        if ppr_default is not None:
            spacing = first_or_create(ppr_default, "spacing")
            set_attr(spacing, "after", "120")
            set_attr(spacing, "line", "264")
            set_attr(spacing, "lineRule", "auto")

    for style_id in ("Normal", "BodyText", "FirstParagraph"):
        patch_style(styles_root, style_id, size=22, color="263238", after=120, line=264)
    patch_style(styles_root, "Title", size=60, color="203748", bold=True, align="center", after=240)
    patch_style(styles_root, "Subtitle", size=30, color="2B5163", align="center", after=180)
    patch_style(styles_root, "Author", size=20, color="65727A", align="center", after=80)
    patch_style(styles_root, "Date", size=20, color="65727A", align="center", after=80)
    patch_style(styles_root, "Heading1", size=32, color="2E74B5", bold=True, before=320, after=160, keep_next=True)
    patch_style(styles_root, "Heading2", size=26, color="2E74B5", bold=True, before=240, after=120, keep_next=True)
    patch_style(styles_root, "Heading3", size=24, color="1F4D78", bold=True, before=160, after=80, keep_next=True)
    patch_style(styles_root, "ListParagraph", size=20, color="263238", after=160, line=280)
    patch_style(styles_root, "BlockText", size=22, color="203748", italic=True, after=160, line=264)
    patch_style(styles_root, "Caption", size=18, color="65727A", italic=True, after=80)
    patch_style(styles_root, "Bibliography", size=18, color="3E4A50", after=80, line=240)

    hyperlink = styles_root.find(".//w:style[@w:styleId='Hyperlink']", NS)
    if hyperlink is not None:
        rpr = first_or_create(hyperlink, "rPr")
        set_attr(first_or_create(rpr, "color"), "val", "2E74B5")
        set_attr(first_or_create(rpr, "u"), "val", "single")

    members["word/styles.xml"] = etree.tostring(styles_root, xml_declaration=True, encoding="UTF-8", standalone=True)
    set_core_properties(members, "PDP 2026 report reference template")
    write_docx_members(path, members)


def write_docx_members(path: Path, members: dict[str, bytes]) -> None:
    """Write a deterministic replacement DOCX from member bytes."""

    temp_path = path.with_suffix(".tmp.docx")
    with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(members):
            archive.writestr(name, members[name])
    os.replace(temp_path, path)


def add_header_footer_and_table_format(path: Path) -> None:
    """Add running furniture and normalize page/table geometry."""

    with zipfile.ZipFile(path, "r") as archive:
        members = {info.filename: archive.read(info.filename) for info in archive.infolist()}

    document_root = etree.fromstring(members["word/document.xml"])
    rels_root = etree.fromstring(members["word/_rels/document.xml.rels"])
    content_root = etree.fromstring(members["[Content_Types].xml"])

    numeric_ids = []
    for rel in rels_root.findall(qn(REL_NS, "Relationship")):
        rid = rel.get("Id", "")
        if rid.startswith("rId") and rid[3:].isdigit():
            numeric_ids.append(int(rid[3:]))
    header_rid = f"rId{max(numeric_ids, default=0) + 1}"
    footer_rid = f"rId{max(numeric_ids, default=0) + 2}"
    etree.SubElement(
        rels_root,
        qn(REL_NS, "Relationship"),
        Id=header_rid,
        Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
        Target="header1.xml",
    )
    etree.SubElement(
        rels_root,
        qn(REL_NS, "Relationship"),
        Id=footer_rid,
        Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
        Target="footer1.xml",
    )

    for part_name, content_type in (
        ("/word/header1.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"),
        ("/word/footer1.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"),
    ):
        if content_root.find(f"{{{CT_NS}}}Override[@PartName='{part_name}']") is None:
            etree.SubElement(content_root, qn(CT_NS, "Override"), PartName=part_name, ContentType=content_type)

    sect_prs = document_root.findall(".//w:sectPr", NS)
    for sect_pr in sect_prs:
        for old in sect_pr.findall("w:headerReference", NS) + sect_pr.findall("w:footerReference", NS):
            sect_pr.remove(old)
        header_ref = etree.Element(qn(W_NS, "headerReference"))
        header_ref.set(qn(W_NS, "type"), "default")
        header_ref.set(qn(R_NS, "id"), header_rid)
        footer_ref = etree.Element(qn(W_NS, "footerReference"))
        footer_ref.set(qn(W_NS, "type"), "default")
        footer_ref.set(qn(R_NS, "id"), footer_rid)
        sect_pr.insert(0, footer_ref)
        sect_pr.insert(0, header_ref)
        first_or_create(sect_pr, "titlePg")
        page_size = first_or_create(sect_pr, "pgSz")
        set_attr(page_size, "w", "12240")
        set_attr(page_size, "h", "15840")
        page_margin = first_or_create(sect_pr, "pgMar")
        for key, value in {
            "top": "1440",
            "right": "1440",
            "bottom": "1440",
            "left": "1440",
            "header": "708",
            "footer": "708",
            "gutter": "0",
        }.items():
            set_attr(page_margin, key, value)

    for table in document_root.findall(".//w:tbl", NS):
        table_pr = first_or_create(table, "tblPr")
        table_width = first_or_create(table_pr, "tblW")
        set_attr(table_width, "w", "9360")
        set_attr(table_width, "type", "dxa")
        table_indent = first_or_create(table_pr, "tblInd")
        set_attr(table_indent, "w", "120")
        set_attr(table_indent, "type", "dxa")
        margins = first_or_create(table_pr, "tblCellMar")
        for edge, value in (("top", "80"), ("start", "120"), ("bottom", "80"), ("end", "120")):
            node = first_or_create(margins, edge)
            set_attr(node, "w", value)
            set_attr(node, "type", "dxa")
        borders = first_or_create(table_pr, "tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            border = first_or_create(borders, edge)
            set_attr(border, "val", "single")
            set_attr(border, "sz", "4")
            set_attr(border, "space", "0")
            set_attr(border, "color", "C9D2D8")
        rows = table.findall("w:tr", NS)
        for index, row in enumerate(rows):
            tr_pr = first_or_create(row, "trPr")
            first_or_create(tr_pr, "cantSplit")
            if index == 0:
                first_or_create(tr_pr, "tblHeader")
                for cell in row.findall("w:tc", NS):
                    cell_pr = first_or_create(cell, "tcPr")
                    shading = first_or_create(cell_pr, "shd")
                    set_attr(shading, "val", "clear")
                    set_attr(shading, "fill", "F2F4F7")
                    for run in cell.findall(".//w:r", NS):
                        run_pr = first_or_create(run, "rPr")
                        first_or_create(run_pr, "b")
                        set_attr(first_or_create(run_pr, "color"), "val", "203748")
                    for paragraph in cell.findall(".//w:p", NS):
                        first_or_create(first_or_create(paragraph, "pPr"), "keepNext")

    header_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="{W_NS}" xmlns:r="{R_NS}">
  <w:p>
    <w:pPr>
      <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="C28B32"/></w:pBdr>
      <w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>
      <w:spacing w:after="80"/>
    </w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:smallCaps/><w:color w:val="203748"/><w:sz w:val="17"/></w:rPr><w:t>PAKISTAN AI POLICY MONITOR</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="65727A"/><w:sz w:val="16"/></w:rPr><w:t>18 AUG–3 SEP 2026</w:t></w:r>
  </w:p>
</w:hdr>'''.encode("utf-8")
    footer_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="{W_NS}" xmlns:r="{R_NS}">
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="80"/></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="65727A"/><w:sz w:val="16"/></w:rPr><w:t>VERIFIED MONITORING REPORT  •  </w:t></w:r>
    <w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="65727A"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>
  </w:p>
</w:ftr>'''.encode("utf-8")

    members["word/document.xml"] = etree.tostring(document_root, xml_declaration=True, encoding="UTF-8", standalone=True)
    members["word/_rels/document.xml.rels"] = etree.tostring(rels_root, xml_declaration=True, encoding="UTF-8", standalone=True)
    members["[Content_Types].xml"] = etree.tostring(content_root, xml_declaration=True, encoding="UTF-8", standalone=True)
    members["word/header1.xml"] = header_xml
    members["word/footer1.xml"] = footer_xml

    set_core_properties(
        members,
        "Pakistan AI Policy and Digital Infrastructure: Verified 15-Day Monitoring Report — 18 August–3 September 2026 (UTC)",
    )

    write_docx_members(path, members)


def main() -> None:
    """Build the report source, reference DOCX and final DOCX."""

    dataset = json.loads((INTERMEDIATE / "research_dataset.json").read_text(encoding="utf-8"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    markdown = build_markdown(dataset)
    REPORT_MARKDOWN.write_text(markdown, encoding="utf-8")

    result = subprocess.run(
        ["pandoc", "--print-default-data-file", "reference.docx"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
    REFERENCE_DOCX.write_bytes(result.stdout)
    patch_reference_docx(REFERENCE_DOCX)

    temp_docx = OUTPUT_DOCX.with_suffix(".draft.docx")
    run(
        [
            "pandoc",
            str(REPORT_MARKDOWN),
            "--from=markdown+raw_attribute+pipe_tables+fenced_divs",
            "--to=docx",
            f"--reference-doc={REFERENCE_DOCX}",
            "--standalone",
            "--wrap=none",
            f"--output={temp_docx}",
        ]
    )
    add_header_footer_and_table_format(temp_docx)
    os.replace(temp_docx, OUTPUT_DOCX)

    with zipfile.ZipFile(OUTPUT_DOCX, "r") as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"Corrupt DOCX member: {bad}")
        if "word/document.xml" not in archive.namelist():
            raise RuntimeError("Final DOCX lacks word/document.xml")
    print(OUTPUT_DOCX)


if __name__ == "__main__":
    main()
