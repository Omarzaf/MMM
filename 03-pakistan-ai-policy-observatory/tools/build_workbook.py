#!/usr/bin/env python3
"""Build the audited Pakistan AI Policy Monitor evidence workbook."""

from __future__ import annotations

import csv
import json
import math
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import ColorScaleRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, NamedStyle, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo


ROOT = Path(__file__).resolve().parents[1]
INTERMEDIATE = ROOT / "intermediate"
OUTPUT_DIR = ROOT / "outputs" / "01a0653c-96d7-7c92-918b-3975d6716164"
OUTPUT_PATH = OUTPUT_DIR / (
    "Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_"
    "2026-08-18_to_2026-09-03.xlsx"
)

TITLE = "Pakistan AI Policy Monitor"
SUBTITLE = "Evidence Register and Coverage Log | 18 August–3 September 2026 (UTC)"
AUTHOR = "Muhammad Umar Zafar"

# Report-matched editorial palette.
NAVY = "172A3A"
TEAL = "0F6B6D"
TEAL_DARK = "0A5254"
GOLD = "C9952E"
CREAM = "F7F3EA"
PALE_TEAL = "E4F1F1"
PALE_GOLD = "F8EDCF"
PALE_BLUE = "E8EEF4"
PALE_GREEN = "E7F1E8"
PALE_RED = "F8E4E2"
PALE_AMBER = "F8EFD8"
WHITE = "FFFFFF"
INK = "22313B"
MUTED = "5E6C75"
LIGHT_BORDER = "CBD4D9"
LINK_BLUE = "1D5C96"

THIN_GREY = Side(style="thin", color=LIGHT_BORDER)
MEDIUM_NAVY = Side(style="medium", color=NAVY)


def read_csv(name: str) -> list[dict[str, str]]:
    """Read an audited UTF-8 CSV into ordered dictionaries."""
    with (INTERMEDIATE / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(name: str) -> dict[str, Any]:
    """Read an audited UTF-8 JSON file."""
    with (INTERMEDIATE / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def humanize_header(value: str) -> str:
    """Convert snake_case source headers to compact reader-facing labels."""
    label = value.replace("_", " ").title()
    replacements = {
        "Id": "ID",
        "Ids": "IDs",
        "Url": "URL",
        "Urls": "URLs",
        "Utc": "UTC",
        "Pkt": "PKT",
        "Sha-256": "SHA-256",
        "Sha256": "SHA-256",
        "Pdu": "PDU",
    }
    for old, new in replacements.items():
        label = label.replace(old, new)
    return label


def strict_date(value: str) -> date | str:
    """Return a typed date only when the source is exactly ISO YYYY-MM-DD."""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return date.fromisoformat(value)
    return value


def typed_datetime(value: str, target_zone: str | None = None) -> datetime | str:
    """Return a timezone-normalized, Excel-compatible naive datetime."""
    if not value:
        return value
    candidate = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return value
    if parsed.tzinfo is None:
        return parsed
    if target_zone == "UTC":
        parsed = parsed.astimezone(timezone.utc)
    return parsed.replace(tzinfo=None)


def typed_value(sheet_name: str, field: str, raw: str) -> Any:
    """Preserve evidence text while typing unambiguous dates and numerics."""
    value = raw.strip() if isinstance(raw, str) else raw
    if value == "":
        return None

    if sheet_name == "Coverage & Gaps":
        if field in {"gap_minutes", "gap_hours"}:
            return float(value)
        if field == "approximate_missing_15m_runs":
            return int(value)
        if field == "material_gap":
            return value.lower() in {"true", "yes", "1"}
        if field in {"gap_start_utc", "gap_end_utc"}:
            return typed_datetime(value, "UTC")

    if sheet_name == "Briefing Units":
        if field == "nominal_date":
            return strict_date(value)
        if field in {"window_start_utc", "window_end_utc"}:
            return typed_datetime(value, "UTC")
        if field in {"window_start_pkt", "window_end_pkt"}:
            return typed_datetime(value)

    if sheet_name == "File Inventory":
        if field in {"bytes", "apparent_briefing_units"}:
            return int(value)
        if field == "readable":
            return value.lower() == "yes"
        if field in {
            "filesystem_birthtime",
            "filesystem_mtime",
            "internal_created",
            "internal_modified",
        }:
            return typed_datetime(value, "UTC")

    if sheet_name == "Sources" and field == "access_date_utc":
        return strict_date(value)

    if field in {
        "event_date",
        "publication_date",
        "first_detected",
        "last_updated",
        "date_or_trigger",
    }:
        return strict_date(value)

    return value


def register_named_styles(workbook: Workbook) -> None:
    """Register the workbook's reusable typography and role styles."""
    styles = [
        NamedStyle(
            name="pkp_body",
            font=Font(name="Aptos", size=10, color=INK),
            alignment=Alignment(vertical="top", wrap_text=True),
        ),
        NamedStyle(
            name="pkp_formula",
            font=Font(name="Aptos", size=10, bold=True, color=TEAL_DARK),
            fill=PatternFill("solid", fgColor=PALE_TEAL),
            alignment=Alignment(vertical="center", horizontal="right"),
            border=Border(bottom=THIN_GREY),
        ),
        NamedStyle(
            name="pkp_input",
            font=Font(name="Aptos", size=10, bold=True, color="76520F"),
            fill=PatternFill("solid", fgColor=PALE_GOLD),
            alignment=Alignment(vertical="center", horizontal="right"),
            border=Border(bottom=THIN_GREY),
        ),
        NamedStyle(
            name="pkp_link",
            font=Font(name="Aptos", size=9, color=LINK_BLUE, underline="single"),
            alignment=Alignment(vertical="top", wrap_text=True),
        ),
    ]
    for style in styles:
        workbook.add_named_style(style)


def set_workbook_properties(workbook: Workbook) -> None:
    """Set descriptive metadata and calculation behavior."""
    workbook.properties.title = f"{TITLE}: Evidence Register and Coverage Log"
    workbook.properties.subject = (
        "Audited 15-day monitor of Pakistan AI policy, digital infrastructure, "
        "procurement, and related governance developments"
    )
    workbook.properties.creator = AUTHOR
    workbook.properties.lastModifiedBy = AUTHOR
    workbook.properties.description = (
        "Formula-driven audit workbook over the verified event, source, coverage, "
        "exclusion, watchlist, and provenance registers."
    )
    workbook.properties.keywords = (
        "Pakistan; AI policy; digital infrastructure; evidence register; procurement"
    )
    workbook.calculation.calcMode = "auto"
    workbook.calculation.fullCalcOnLoad = True
    workbook.calculation.forceFullCalc = True
    workbook.calculation.calcOnSave = True


def configure_sheet(
    worksheet: Any,
    *,
    tab_color: str,
    zoom: int = 90,
    orientation: str = "landscape",
) -> None:
    """Apply common viewing and print settings to a worksheet."""
    worksheet.sheet_view.showGridLines = False
    worksheet.sheet_view.zoomScale = zoom
    worksheet.sheet_view.zoomScaleNormal = zoom
    worksheet.sheet_properties.tabColor = tab_color
    worksheet.sheet_properties.pageSetUpPr.fitToPage = True
    worksheet.page_setup.orientation = orientation
    worksheet.page_setup.paperSize = worksheet.PAPERSIZE_LETTER
    worksheet.page_setup.fitToWidth = 1
    worksheet.page_setup.fitToHeight = 0
    worksheet.sheet_properties.outlinePr.summaryBelow = True
    worksheet.page_margins.left = 0.25
    worksheet.page_margins.right = 0.25
    worksheet.page_margins.top = 0.45
    worksheet.page_margins.bottom = 0.45
    worksheet.page_margins.header = 0.2
    worksheet.page_margins.footer = 0.2
    worksheet.oddFooter.center.text = "Pakistan AI Policy Monitor | &[Page] of &[Pages]"
    worksheet.oddFooter.center.size = 8
    worksheet.oddFooter.center.color = MUTED


def add_title_band(
    worksheet: Any,
    title: str,
    subtitle: str,
    max_column: int,
) -> None:
    """Create the two-row editorial title band."""
    end = get_column_letter(max_column)
    worksheet.merge_cells(f"A1:{end}1")
    worksheet["A1"] = title
    worksheet["A1"].font = Font(
        name="Aptos Display", size=21, bold=True, color=WHITE
    )
    worksheet["A1"].fill = PatternFill("solid", fgColor=NAVY)
    worksheet["A1"].alignment = Alignment(vertical="center", horizontal="left")
    worksheet.row_dimensions[1].height = 33

    worksheet.merge_cells(f"A2:{end}2")
    worksheet["A2"] = subtitle
    worksheet["A2"].font = Font(name="Aptos", size=10, color=WHITE, italic=True)
    worksheet["A2"].fill = PatternFill("solid", fgColor=TEAL)
    worksheet["A2"].alignment = Alignment(
        vertical="center", horizontal="left", wrap_text=True
    )
    worksheet.row_dimensions[2].height = 30


def add_section_band(
    worksheet: Any,
    row: int,
    text: str,
    start_column: int,
    end_column: int,
    *,
    color: str = NAVY,
) -> None:
    """Add a merged section label outside calculation regions."""
    start = get_column_letter(start_column)
    end = get_column_letter(end_column)
    worksheet.merge_cells(start_row=row, start_column=start_column, end_row=row, end_column=end_column)
    cell = worksheet.cell(row=row, column=start_column, value=text)
    cell.fill = PatternFill("solid", fgColor=color)
    cell.font = Font(name="Aptos", size=10, bold=True, color=WHITE)
    cell.alignment = Alignment(vertical="center", horizontal="left")
    worksheet.row_dimensions[row].height = 22


def style_table_header(worksheet: Any, row: int, first: int, last: int) -> None:
    """Style a structured-table header consistently."""
    for column in range(first, last + 1):
        cell = worksheet.cell(row=row, column=column)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.font = Font(name="Aptos", size=9, bold=True, color=WHITE)
        cell.alignment = Alignment(
            vertical="center", horizontal="left", wrap_text=True
        )
        cell.border = Border(bottom=MEDIUM_NAVY)


def add_excel_table(
    worksheet: Any,
    *,
    name: str,
    min_row: int,
    max_row: int,
    min_column: int,
    max_column: int,
) -> None:
    """Wrap a populated range in a filterable Excel table."""
    ref = (
        f"{get_column_letter(min_column)}{min_row}:"
        f"{get_column_letter(max_column)}{max_row}"
    )
    table = Table(displayName=name, ref=ref)
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    worksheet.add_table(table)


def number_format_for(field: str, value: Any) -> str | None:
    """Return an Excel-invariant number format for a typed source value."""
    if isinstance(value, bool):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return "yyyy-mm-dd"
    if isinstance(value, datetime):
        if field.endswith("_pkt"):
            return 'yyyy-mm-dd hh:mm "PKT"'
        return 'yyyy-mm-dd hh:mm "UTC"'
    if field in {"bytes", "apparent_briefing_units", "approximate_missing_15m_runs"}:
        return "#,##0"
    if field == "gap_minutes":
        return "#,##0.00"
    if field == "gap_hours":
        return "#,##0.0"
    return None


def estimate_row_height(values: list[Any], widths: list[float], cap: float) -> float:
    """Estimate a readable wrapped row height without creating extreme rows."""
    line_counts: list[int] = []
    for value, width in zip(values, widths):
        if value is None:
            continue
        text = str(value)
        explicit = text.count("\n") + 1
        wrapped = math.ceil(len(text) / max(8.0, width * 1.15))
        line_counts.append(max(explicit, wrapped))
    lines = max(line_counts, default=1)
    return min(cap, max(24.0, 14.0 * min(lines, 10) + 6.0))


def add_data_sheet(
    workbook: Workbook,
    *,
    name: str,
    subtitle: str,
    rows: list[dict[str, Any]],
    table_name: str,
    widths: dict[str, float],
    freeze_cell: str,
    tab_color: str,
    row_height_cap: float = 90.0,
    link_fields: set[str] | None = None,
    orientation: str = "landscape",
) -> Any:
    """Create a filterable, typed, styled register worksheet."""
    link_fields = link_fields or set()
    worksheet = workbook.create_sheet(name)
    fields = list(rows[0].keys()) if rows else []
    max_column = max(1, len(fields))
    configure_sheet(
        worksheet,
        tab_color=tab_color,
        zoom=80 if len(fields) > 12 else 90,
        orientation=orientation,
    )
    add_title_band(worksheet, name, subtitle, max_column)

    header_row = 4
    data_start = 5
    for index, field in enumerate(fields, start=1):
        worksheet.cell(row=header_row, column=index, value=humanize_header(field))
    style_table_header(worksheet, header_row, 1, max_column)
    worksheet.row_dimensions[header_row].height = 42

    ordered_widths = [widths.get(field, 18.0) for field in fields]
    for index, (field, width) in enumerate(zip(fields, ordered_widths), start=1):
        worksheet.column_dimensions[get_column_letter(index)].width = width

    for row_offset, row in enumerate(rows, start=data_start):
        values: list[Any] = []
        for column, field in enumerate(fields, start=1):
            value = typed_value(name, field, str(row.get(field, "")))
            values.append(value)
            cell = worksheet.cell(row=row_offset, column=column, value=value)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
            fmt = number_format_for(field, value)
            if fmt:
                cell.number_format = fmt
            if (
                field in link_fields
                and isinstance(value, str)
                and re.fullmatch(r"https?://\S+", value)
                and len(re.findall(r"https?://", value)) == 1
            ):
                cell.hyperlink = value
                cell.style = "pkp_link"
                cell.border = Border(bottom=THIN_GREY)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cell.alignment = Alignment(vertical="top", horizontal="right")
        worksheet.row_dimensions[row_offset].height = estimate_row_height(
            values, ordered_widths, row_height_cap
        )

    max_row = data_start + len(rows) - 1
    if rows:
        add_excel_table(
            worksheet,
            name=table_name,
            min_row=header_row,
            max_row=max_row,
            min_column=1,
            max_column=max_column,
        )
    worksheet.freeze_panes = freeze_cell
    worksheet.print_title_rows = f"1:{header_row}"
    worksheet.print_area = f"A1:{get_column_letter(max_column)}{max_row}"
    return worksheet


def add_formula_comment(cell: Any, explanation: str) -> None:
    """Document an important audit formula or input."""
    cell.comment = Comment(explanation, AUTHOR)


def build_read_me(
    workbook: Workbook,
    *,
    dataset: dict[str, Any],
    counts: dict[str, int],
) -> Any:
    """Build the formula-driven orientation and control sheet."""
    worksheet = workbook.active
    worksheet.title = "Read Me"
    configure_sheet(worksheet, tab_color=GOLD, zoom=90, orientation="portrait")
    add_title_band(worksheet, TITLE, SUBTITLE, 9)
    worksheet.merge_cells("A3:I3")
    worksheet["A3"] = (
        "Search cutoff: 2026-09-03 04:15 UTC | Evidence and lifecycle status "
        "should be rechecked before any later reuse."
    )
    worksheet["A3"].font = Font(name="Aptos", size=9, color=MUTED)
    worksheet["A3"].alignment = Alignment(vertical="center", wrap_text=True)
    worksheet.row_dimensions[3].height = 24

    add_section_band(worksheet, 5, "Interpretation boundary", 1, 9, color=TEAL_DARK)
    worksheet.merge_cells("A6:I7")
    worksheet["A6"] = dataset["report"]["comprehensive_definition"]
    worksheet["A6"].fill = PatternFill("solid", fgColor=CREAM)
    worksheet["A6"].font = Font(name="Aptos", size=11, bold=True, color=INK)
    worksheet["A6"].alignment = Alignment(vertical="center", wrap_text=True)
    worksheet["A6"].border = Border(left=MEDIUM_NAVY, right=THIN_GREY, bottom=THIN_GREY)
    worksheet.row_dimensions[6].height = 28
    worksheet.row_dimensions[7].height = 28

    worksheet.merge_cells("A8:I9")
    worksheet["A8"] = (
        "Temporal caveat — The supplied corpus contains 14 briefing units against "
        "a nominal 1,440 runs for exactly 15 days at a 15-minute cadence. Negative "
        "findings are therefore bounded to the supplied files and documented searches; "
        "missing intervals are never imputed."
    )
    worksheet["A8"].fill = PatternFill("solid", fgColor=PALE_AMBER)
    worksheet["A8"].font = Font(name="Aptos", size=10, color=INK)
    worksheet["A8"].alignment = Alignment(vertical="center", wrap_text=True)
    worksheet["A8"].border = Border(left=Side(style="medium", color=GOLD), bottom=THIN_GREY)
    worksheet.row_dimensions[8].height = 34
    worksheet.row_dimensions[9].height = 34

    add_section_band(worksheet, 11, "Formula-driven control totals", 1, 5)
    control_headers = ["Control", "Live value", "Unit", "Expected", "Reconciliation"]
    for column, label in enumerate(control_headers, start=1):
        worksheet.cell(row=12, column=column, value=label)
    style_table_header(worksheet, 12, 1, 5)
    worksheet.row_dimensions[12].height = 28

    evidence_end = 4 + counts["evidence"]
    source_end = 4 + counts["sources"]
    briefing_end = 4 + counts["briefings"]
    exclusion_end = 4 + counts["exclusions"]
    watch_end = 4 + counts["watchlist"]
    controls = [
        (
            "Evidence register rows",
            f"=COUNTA('Evidence Register'!$A$5:$A${evidence_end})",
            "records",
            52,
            "Counts every populated Event ID."
        ),
        (
            "In-period / verification-discovered",
            f'=COUNTIF(\'Evidence Register\'!$A$5:$A${evidence_end},"EVT-*")',
            "records",
            36,
            "Event-class records are identified by the stable EVT- prefix."
        ),
        (
            "Baseline / context",
            f'=COUNTIF(\'Evidence Register\'!$A$5:$A${evidence_end},"BASE-*")',
            "records",
            16,
            "Baseline records are identified by the stable BASE- prefix."
        ),
        (
            "Baseline carry-in",
            f'=COUNTIFS(\'Evidence Register\'!$A$5:$A${evidence_end},"BASE-*",\'Evidence Register\'!$Z$5:$Z${evidence_end},"BASELINE_CARRY_IN")',
            "records",
            13,
            "Counts baseline IDs whose lifecycle is BASELINE_CARRY_IN."
        ),
        (
            "Baseline contradicted / unresolved",
            f'=COUNTIFS(\'Evidence Register\'!$A$5:$A${evidence_end},"BASE-*",\'Evidence Register\'!$Z$5:$Z${evidence_end},"CONTRADICTED_OR_UNRESOLVED")',
            "records",
            3,
            "Counts disputed baseline IDs separately from the one disputed in-period event."
        ),
        (
            "Sources",
            f"=COUNTA('Sources'!$A$5:$A${source_end})",
            "records",
            111,
            "Counts source IDs S001–S111."
        ),
        (
            "Briefing units",
            f"=COUNTA('Briefing Units'!$A$5:$A${briefing_end})",
            "units",
            14,
            "Counts normalized briefing IDs B001–B014."
        ),
        (
            "Exclusions",
            f"=COUNTA('Exclusions'!$A$5:$A${exclusion_end})",
            "items",
            13,
            "Counts every documented exclusion decision."
        ),
        (
            "Watch items",
            f"=COUNTA('Watchlist'!$A$5:$A${watch_end})",
            "items",
            14,
            "Counts every future verification trigger."
        ),
        (
            "High confidence",
            f'=COUNTIF(\'Evidence Register\'!$V$5:$V${evidence_end},"High")',
            "records",
            32,
            "Confidence is controlled by the audited Confidence field."
        ),
        (
            "Medium confidence",
            f'=COUNTIF(\'Evidence Register\'!$V$5:$V${evidence_end},"Medium")',
            "records",
            16,
            "Confidence is controlled by the audited Confidence field."
        ),
        (
            "Low confidence",
            f'=COUNTIF(\'Evidence Register\'!$V$5:$V${evidence_end},"Low")',
            "records",
            4,
            "Confidence is controlled by the audited Confidence field."
        ),
    ]
    for row_number, (label, formula, unit, expected, note) in enumerate(controls, start=13):
        worksheet.cell(row=row_number, column=1, value=label)
        live = worksheet.cell(row=row_number, column=2, value=formula)
        live.style = "pkp_formula"
        add_formula_comment(live, note)
        worksheet.cell(row=row_number, column=3, value=unit)
        expected_cell = worksheet.cell(row=row_number, column=4, value=expected)
        expected_cell.style = "pkp_input"
        add_formula_comment(
            expected_cell,
            "Audited expected total retained as a visible control input from the reviewed dataset specification."
        )
        check = worksheet.cell(row=row_number, column=5, value=f'=IF(B{row_number}=D{row_number},"PASS","CHECK")')
        check.style = "pkp_formula"
        add_formula_comment(check, "Reconciles the live formula result to the audited expected total.")
        for column in (1, 3):
            cell = worksheet.cell(row=row_number, column=column)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 25

    worksheet.conditional_formatting.add(
        "E13:E24",
        FormulaRule(
            formula=['E13="PASS"'],
            stopIfTrue=True,
            fill=PatternFill("solid", fgColor=PALE_GREEN),
            font=Font(name="Aptos", bold=True, color="2F6B3A"),
        ),
    )
    worksheet.conditional_formatting.add(
        "E13:E24",
        FormulaRule(
            formula=['E13="CHECK"'],
            stopIfTrue=True,
            fill=PatternFill("solid", fgColor=PALE_RED),
            font=Font(name="Aptos", bold=True, color="9E2F2A"),
        ),
    )

    add_section_band(worksheet, 11, "Coverage controls", 7, 9, color=TEAL_DARK)
    coverage_headers = ["Metric", "Live value", "Interpretation"]
    for column, label in zip(range(7, 10), coverage_headers):
        worksheet.cell(row=12, column=column, value=label)
    style_table_header(worksheet, 12, 7, 9)
    coverage_rows = [
        ("Nominal expected runs", "='Coverage & Gaps'!$B$6", "Exactly 15 days × 24 hours × 4 runs/hour"),
        ("Observed briefing units", "='Coverage & Gaps'!$B$7", "Normalized supplied briefing units"),
        ("Nominal missing runs", "='Coverage & Gaps'!$B$8", "Expected minus observed"),
        ("Observed share", "='Coverage & Gaps'!$B$9", "Observed divided by nominal expected"),
        ("Strict-window share", "='Coverage & Gaps'!$B$12", "Strict observed minutes divided by observed span"),
        ("Search cutoff", dataset["report"]["search_cutoff_utc"], "Current-source verification boundary"),
    ]
    for row_number, (label, value, interpretation) in enumerate(coverage_rows, start=13):
        worksheet.cell(row=row_number, column=7, value=label).style = "pkp_body"
        value_cell = worksheet.cell(row=row_number, column=8, value=value)
        if isinstance(value, str) and value.startswith("="):
            value_cell.style = "pkp_formula"
            add_formula_comment(value_cell, "Linked to the formula-driven coverage control sheet.")
        else:
            value_cell.style = "pkp_body"
        worksheet.cell(row=row_number, column=9, value=interpretation).style = "pkp_body"
        for column in range(7, 10):
            worksheet.cell(row=row_number, column=column).border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 30
    worksheet["H16"].number_format = "0.00%"
    worksheet["H17"].number_format = "0.00%"

    add_section_band(worksheet, 27, "Evidence model and source hierarchy", 1, 9)
    model_headers = ["Layer", "Rule", "Why it matters"]
    for column, label in enumerate(model_headers, start=1):
        worksheet.cell(row=28, column=column, value=label)
    style_table_header(worksheet, 28, 1, 3)
    model_rows = [
        ("Verified facts", "State only what an accessible record directly supports.", "Prevents announcement language from becoming implementation evidence."),
        ("Source claims", "Attribute unverified operational, scale, or outcome claims.", "Preserves what institutions said without adopting it as fact."),
        ("Interpretation", "Separate analytical synthesis from sourced fact.", "Makes reasoning auditable and contestable."),
        ("Forward implications", "Express future-facing consequences as bounded scenarios.", "Avoids converting plausible pathways into forecasts."),
        ("Lifecycle", "Classify proposal, consultation, approval, award, signing, delivery, and operation separately.", "Prevents stage inflation."),
        ("Conflict", "Retain both dated versions and identify mutable-source limits.", "Preserves the WHO 24-Aug capture versus 28-Aug live-page discrepancy."),
    ]
    for row_number, values in enumerate(model_rows, start=29):
        for column, value in enumerate(values, start=1):
            cell = worksheet.cell(row=row_number, column=column, value=value)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 44

    hierarchy_headers = ["Priority", "Source class", "Use"]
    for column, label in zip(range(7, 10), hierarchy_headers):
        worksheet.cell(row=28, column=column, value=label)
    style_table_header(worksheet, 28, 7, 9)
    hierarchy_rows = [
        (1, "Primary law, gazette, regulator, procurement register", "Lifecycle and operative-text conclusions"),
        (2, "Official ministry, authority, institution, company", "Event facts and attributed claims"),
        (3, "Independent reporting", "Corroboration, context, and contested details"),
        (4, "Briefing corpus", "Discovery provenance only; never independent corroboration"),
    ]
    for row_number, values in enumerate(hierarchy_rows, start=29):
        for column, value in zip(range(7, 10), values):
            cell = worksheet.cell(row=row_number, column=column, value=value)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = max(worksheet.row_dimensions[row_number].height or 0, 44)

    add_section_band(worksheet, 37, "Workbook navigation", 1, 9, color=TEAL_DARK)
    navigation = [
        ("Evidence Register", "52 distinct event/baseline records with lifecycle, confidence, facts, claims, analysis, implications, and source URLs."),
        ("Coverage & Gaps", "Cadence controls, normalized observed span, and all 13 inter-briefing gaps."),
        ("Exclusions", "Every out-of-scope, duplicate, or unsupported item and its disposition."),
        ("Briefing Units", "B001–B014 source provenance, normalized UTC/PKT windows, timing issues, and SHA-256 hashes."),
        ("Sources", "S001–S111 source register with plain-text URLs and limitations."),
        ("Watchlist", "W001–W014 future triggers and verification tasks."),
        ("File Inventory", "All 13 received top-level files, readability, metadata, hashes, and inclusion decisions."),
        ("Methodology", "Reproducibility chain, source hierarchy, lifecycle rules, confidence rubric, and refresh protocol."),
    ]
    for row_number, (sheet_name, purpose) in enumerate(navigation, start=38):
        link = worksheet.cell(row=row_number, column=1, value=sheet_name)
        link.hyperlink = f"#'{sheet_name}'!A1"
        link.style = "pkp_link"
        worksheet.merge_cells(start_row=row_number, start_column=2, end_row=row_number, end_column=9)
        purpose_cell = worksheet.cell(row=row_number, column=2, value=purpose)
        purpose_cell.style = "pkp_body"
        link.border = Border(bottom=THIN_GREY)
        purpose_cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 34

    widths = {"A": 31, "B": 15, "C": 12, "D": 13, "E": 16, "F": 3, "G": 25, "H": 17, "I": 43}
    for column, width in widths.items():
        worksheet.column_dimensions[column].width = width
    worksheet.freeze_panes = "A5"
    worksheet.print_area = "A1:I45"
    worksheet.print_title_rows = "1:3"
    return worksheet


def build_coverage_sheet(
    workbook: Workbook,
    *,
    audit: dict[str, Any],
    gaps: list[dict[str, str]],
    briefing_count: int,
) -> Any:
    """Build cadence controls, normalized period notes, and gap register."""
    worksheet = workbook.create_sheet("Coverage & Gaps")
    configure_sheet(worksheet, tab_color=GOLD, zoom=90)
    add_title_band(
        worksheet,
        "Coverage & Gaps",
        "Formula-driven cadence reconciliation and every inter-briefing gap; missing intervals are not imputed.",
        8,
    )
    add_section_band(worksheet, 4, "Cadence controls", 1, 4)
    headers = ["Metric", "Value", "Unit", "Basis"]
    for column, label in enumerate(headers, start=1):
        worksheet.cell(row=5, column=column, value=label)
    style_table_header(worksheet, 5, 1, 4)

    briefing_end = 4 + briefing_count
    summary_rows: list[tuple[str, Any, str, str, bool]] = [
        ("Nominal expected briefing runs", audit["nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence"], "runs", "15 days × 24 hours × 4 runs/hour", False),
        ("Observed briefing units", f"=COUNTA('Briefing Units'!$A$5:$A${briefing_end})", "units", "Normalized B001–B014 rows", True),
        ("Nominal missing runs", "=B6-B7", "runs", "Nominal expected minus observed", True),
        ("Observed share of nominal expected", "=IF(B6=0,0,B7/B6)", "share", "Divide-by-zero protected", True),
        ("Observed span minutes", audit["observed_span_minutes"], "minutes", "First normalized window start to last normalized window end", False),
        ("Observed strict-window minutes", audit["observed_strict_window_minutes"], "minutes", "Sum of explicit or reconstructed briefing windows", False),
        ("Strict-window share of observed span", "=IF(B10=0,0,B11/B10)", "share", "Strict observed minutes ÷ observed span", True),
        ("Expected runs across observed span", audit["approximate_expected_briefings_across_observed_span_at_15_minute_cadence"], "runs", "Observed span at a 15-minute cadence", False),
        ("Approximate missing across observed span", "=B13-B7", "runs", "Span-based expected minus observed", True),
        ("Observed share of span-based expected", "=IF(B13=0,0,B7/B13)", "share", "Divide-by-zero protected", True),
    ]
    for row_number, (metric, value, unit, basis, is_formula) in enumerate(summary_rows, start=6):
        worksheet.cell(row=row_number, column=1, value=metric).style = "pkp_body"
        value_cell = worksheet.cell(row=row_number, column=2, value=value)
        value_cell.style = "pkp_formula" if is_formula else "pkp_input"
        add_formula_comment(
            value_cell,
            (
                "Auditable formula over workbook cells. Excel recalculates on open."
                if is_formula
                else "Audited source input from intermediate/audit_summary.json."
            ),
        )
        worksheet.cell(row=row_number, column=3, value=unit).style = "pkp_body"
        worksheet.cell(row=row_number, column=4, value=basis).style = "pkp_body"
        for column in range(1, 5):
            worksheet.cell(row=row_number, column=column).border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 29
    for coordinate in ("B9", "B12", "B15"):
        worksheet[coordinate].number_format = "0.00%"
    for coordinate in ("B6", "B7", "B8", "B10", "B13", "B14"):
        worksheet[coordinate].number_format = "#,##0"
    worksheet["B11"].number_format = "#,##0.00"

    add_section_band(worksheet, 17, "Normalized observation boundary", 1, 8, color=TEAL_DARK)
    boundary_headers = ["Field", "Value", "Interpretation"]
    for column, label in enumerate(boundary_headers, start=1):
        worksheet.cell(row=18, column=column, value=label)
    style_table_header(worksheet, 18, 1, 3)
    boundary_rows = [
        ("Observed start", typed_datetime(audit["observed_span_start_utc"], "UTC"), "First normalized briefing-window start"),
        ("Observed end", typed_datetime(audit["observed_span_end_utc"], "UTC"), "Last normalized briefing-window end"),
        ("Search cutoff", typed_datetime("2026-09-03T04:15:00Z", "UTC"), "Latest documented current-source verification time"),
        ("Normalized time zone", "UTC", "PKT equivalents remain visible on the Briefing Units sheet"),
        ("Timestamp policy", audit["timestamp_policy"], "Filename and filesystem timestamps are discovery metadata only"),
        ("Title dates without a briefing", ", ".join(audit["nominal_title_dates_without_a_briefing"]), "Nominal title-date comparison only"),
        ("PKT dates without a normalized window", ", ".join(audit["normalized_pkt_dates_without_a_window_between_first_and_last_pkt_date"]), "Based on normalized PKT coverage between the first and last PKT dates"),
    ]
    for row_number, values in enumerate(boundary_rows, start=19):
        for column, value in enumerate(values, start=1):
            cell = worksheet.cell(row=row_number, column=column, value=value)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
            if isinstance(value, datetime):
                cell.number_format = 'yyyy-mm-dd hh:mm "UTC"'
        worksheet.row_dimensions[row_number].height = 36 if row_number != 23 else 58

    add_section_band(worksheet, 27, "Inter-briefing gap register", 1, 8)
    gap_fields = list(gaps[0].keys()) if gaps else []
    for column, field in enumerate(gap_fields, start=1):
        worksheet.cell(row=28, column=column, value=humanize_header(field))
    style_table_header(worksheet, 28, 1, len(gap_fields))
    worksheet.row_dimensions[28].height = 38
    for row_number, row in enumerate(gaps, start=29):
        for column, field in enumerate(gap_fields, start=1):
            value = typed_value("Coverage & Gaps", field, row[field])
            cell = worksheet.cell(row=row_number, column=column, value=value)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
            fmt = number_format_for(field, value)
            if fmt:
                cell.number_format = fmt
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cell.alignment = Alignment(vertical="top", horizontal="right")
        worksheet.row_dimensions[row_number].height = 26
    gap_end = 28 + len(gaps)
    if gaps:
        add_excel_table(
            worksheet,
            name="tblCoverageGaps",
            min_row=28,
            max_row=gap_end,
            min_column=1,
            max_column=len(gap_fields),
        )
        worksheet.conditional_formatting.add(
            f"G29:G{gap_end}",
            ColorScaleRule(
                start_type="min",
                start_color=PALE_GOLD,
                mid_type="percentile",
                mid_value=50,
                mid_color="E7B65A",
                end_type="max",
                end_color="C45A4A",
            ),
        )
        worksheet.conditional_formatting.add(
            f"H29:H{gap_end}",
            FormulaRule(
                formula=['H29=TRUE'],
                fill=PatternFill("solid", fgColor=PALE_RED),
                font=Font(name="Aptos", bold=True, color="9E2F2A"),
            ),
        )

    widths = {"A": 34, "B": 22, "C": 23, "D": 50, "E": 16, "F": 14, "G": 24, "H": 15}
    for column, width in widths.items():
        worksheet.column_dimensions[column].width = width
    worksheet.freeze_panes = "C29"
    worksheet.print_title_rows = "1:2"
    worksheet.print_area = f"A1:H{gap_end}"
    return worksheet


def apply_evidence_rules(worksheet: Any, end_row: int) -> None:
    """Add evidence-register validation and semantic conditional formatting."""
    confidence = DataValidation(
        type="list",
        formula1='"High,Medium,Low"',
        allow_blank=False,
    )
    confidence.error = "Choose High, Medium, or Low."
    confidence.errorTitle = "Invalid confidence value"
    confidence.prompt = "Select the audited confidence class."
    confidence.promptTitle = "Confidence"
    worksheet.add_data_validation(confidence)
    confidence.add(f"V5:V{end_row}")

    lifecycle_values = (
        "IN_SPAN_DEVELOPMENT,BASELINE_CARRY_IN,MONITORED_NO_CHANGE,CORRECTION,"
        "CONTRADICTED_OR_UNRESOLVED,FUTURE_WATCH,EXCLUDED_OUT_OF_SCOPE"
    )
    lifecycle = DataValidation(
        type="list",
        formula1=f'"{lifecycle_values}"',
        allow_blank=False,
    )
    lifecycle.error = "Choose a lifecycle value from the approved taxonomy."
    lifecycle.errorTitle = "Invalid lifecycle value"
    lifecycle.prompt = "Select the auditable lifecycle stage."
    lifecycle.promptTitle = "Lifecycle"
    worksheet.add_data_validation(lifecycle)
    lifecycle.add(f"Z5:Z{end_row}")

    confidence_colors = {
        "High": (PALE_GREEN, "2F6B3A"),
        "Medium": (PALE_AMBER, "76520F"),
        "Low": (PALE_RED, "9E2F2A"),
    }
    for value, (fill_color, font_color) in confidence_colors.items():
        worksheet.conditional_formatting.add(
            f"V5:V{end_row}",
            FormulaRule(
                formula=[f'$V5="{value}"'],
                fill=PatternFill("solid", fgColor=fill_color),
                font=Font(name="Aptos", bold=True, color=font_color),
            ),
        )

    lifecycle_colors = {
        "IN_SPAN_DEVELOPMENT": PALE_TEAL,
        "BASELINE_CARRY_IN": PALE_BLUE,
        "CONTRADICTED_OR_UNRESOLVED": PALE_RED,
    }
    for value, fill_color in lifecycle_colors.items():
        worksheet.conditional_formatting.add(
            f"Z5:Z{end_row}",
            FormulaRule(
                formula=[f'$Z5="{value}"'],
                fill=PatternFill("solid", fgColor=fill_color),
                font=Font(name="Aptos", bold=True, color=INK),
            ),
        )


def apply_inventory_rules(worksheet: Any, end_row: int) -> None:
    """Highlight inclusion and readability fields on the file inventory."""
    worksheet.conditional_formatting.add(
        f"H5:H{end_row}",
        FormulaRule(
            formula=["H5=TRUE"],
            fill=PatternFill("solid", fgColor=PALE_GREEN),
            font=Font(name="Aptos", bold=True, color="2F6B3A"),
        ),
    )
    worksheet.conditional_formatting.add(
        f"P5:P{end_row}",
        FormulaRule(
            formula=['ISNUMBER(SEARCH("include",P5))'],
            fill=PatternFill("solid", fgColor=PALE_GREEN),
        ),
    )
    worksheet.conditional_formatting.add(
        f"P5:P{end_row}",
        FormulaRule(
            formula=['ISNUMBER(SEARCH("exclude",P5))'],
            fill=PatternFill("solid", fgColor=PALE_RED),
        ),
    )


def build_methodology_sheet(
    workbook: Workbook,
    *,
    dataset: dict[str, Any],
) -> Any:
    """Build an auditable methodology and refresh guide."""
    worksheet = workbook.create_sheet("Methodology")
    configure_sheet(worksheet, tab_color=TEAL, zoom=90, orientation="portrait")
    add_title_band(
        worksheet,
        "Methodology",
        "Extraction, normalization, event clustering, verification, conflict treatment, and refresh protocol.",
        8,
    )

    add_section_band(worksheet, 4, "Reproducibility chain", 1, 8)
    steps = [
        (1, "Inventory", "Hash and inspect all 13 received top-level files; confirm readability, type, and container status."),
        (2, "Normalize", "Extract 14 briefing units, retain source filenames/subunits, and normalize explicit UTC/PKT windows."),
        (3, "Cluster", "Merge repeated briefing mentions into one underlying event while retaining every briefing reference."),
        (4, "Verify", "Prioritize primary operative records, record access dates, and use independent reporting only as corroboration or context."),
        (5, "Classify", "Separate facts, attributed source claims, analysis, implications, confidence, unresolved issues, and lifecycle status."),
        (6, "Reconcile", "Retain conflicting versions explicitly; do not overwrite captured dates with mutable live-page values."),
        (7, "Refresh", "Re-open every source URL, reconfirm lifecycle status, record a new cutoff, and rerun the audit/build/verification chain."),
    ]
    headers = ["Step", "Stage", "Reproducible action"]
    for column, label in enumerate(headers, start=1):
        worksheet.cell(row=5, column=column, value=label)
    worksheet.merge_cells(start_row=5, start_column=3, end_row=5, end_column=8)
    style_table_header(worksheet, 5, 1, 3)
    for row_number, values in enumerate(steps, start=6):
        for column, value in enumerate(values, start=1):
            cell = worksheet.cell(row=row_number, column=column, value=value)
            cell.style = "pkp_body"
            cell.border = Border(bottom=THIN_GREY)
        worksheet.merge_cells(
            start_row=row_number, start_column=3, end_row=row_number, end_column=8
        )
        worksheet.row_dimensions[row_number].height = 38

    add_section_band(worksheet, 15, "Methodological rules", 1, 8, color=TEAL_DARK)
    rules = [
        ("Comprehensive boundary", dataset["report"]["comprehensive_definition"]),
        ("Timestamp authority", "Use explicit internal UTC/PKT windows as authoritative. Filename dates/times and filesystem timestamps are discovery metadata only; reconstructed endpoints remain approximate."),
        ("Negative findings", "Do not infer no change from missing intervals. State only what is supported by the supplied files and documented verification searches."),
        ("Lifecycle precision", "Distinguish proposal, consultation, recommendation, approval, notification, award, signing, delivery, commissioning, and operation."),
        ("Source hierarchy", "Primary law/gazette/regulator/procurement record → official institution/company → independent reporting → supplied briefing as discovery provenance."),
        ("Corroboration", "Later releases about the same underlying event do not create independent corroboration; briefing repetition is provenance, not a second source."),
        ("Conflict treatment", "Preserve each dated version and its access context. WHO S047 retains 24 August in B006 versus 28 August on the current mutable page."),
        ("Google presence", "Keep legal/tax counterparty evidence separate from physical-office evidence, staffing, operational control, and service availability."),
    ]
    for row_number, (rule, description) in enumerate(rules, start=16):
        worksheet.cell(row=row_number, column=1, value=rule).style = "pkp_body"
        worksheet.merge_cells(start_row=row_number, start_column=2, end_row=row_number, end_column=8)
        cell = worksheet.cell(row=row_number, column=2, value=description)
        cell.style = "pkp_body"
        worksheet.cell(row=row_number, column=1).font = Font(name="Aptos", size=10, bold=True, color=NAVY)
        worksheet.cell(row=row_number, column=1).border = Border(bottom=THIN_GREY)
        cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 50

    add_section_band(worksheet, 26, "Confidence rubric", 1, 8)
    for column, label in enumerate(["Class", "Rule"], start=1):
        worksheet.cell(row=27, column=column, value=label)
    style_table_header(worksheet, 27, 1, 2)
    for row_number, (level, definition) in enumerate(dataset["confidence_rubric"].items(), start=28):
        level_cell = worksheet.cell(row=row_number, column=1, value=level)
        level_cell.style = "pkp_body"
        worksheet.merge_cells(start_row=row_number, start_column=2, end_row=row_number, end_column=8)
        definition_cell = worksheet.cell(row=row_number, column=2, value=definition)
        definition_cell.style = "pkp_body"
        level_cell.border = Border(bottom=THIN_GREY)
        definition_cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 48
    color_map = {28: PALE_GREEN, 29: PALE_AMBER, 30: PALE_RED}
    for row_number, color in color_map.items():
        worksheet.cell(row=row_number, column=1).fill = PatternFill("solid", fgColor=color)
        worksheet.cell(row=row_number, column=1).font = Font(name="Aptos", size=10, bold=True, color=INK)

    add_section_band(worksheet, 32, "Lifecycle taxonomy", 1, 8, color=TEAL_DARK)
    lifecycle_explanations = {
        "IN_SPAN_DEVELOPMENT": "Distinct development whose authoritative date or verification discovery falls within the observed period.",
        "BASELINE_CARRY_IN": "Earlier instrument or event retained because it governs interpretation of the observed period.",
        "MONITORED_NO_CHANGE": "Monitored baseline for which a supported status check found no material change.",
        "CORRECTION": "Documented correction to a prior assertion or lifecycle classification.",
        "CONTRADICTED_OR_UNRESOLVED": "Material source conflict, missing operative text, or unresolved identity/status question.",
        "FUTURE_WATCH": "Forward trigger that requires a later evidence check; not an accomplished event.",
        "EXCLUDED_OUT_OF_SCOPE": "Item excluded from the evidence register but documented in the exclusion log.",
    }
    for row_number, lifecycle in enumerate(dataset["lifecycle_values"], start=33):
        worksheet.cell(row=row_number, column=1, value=lifecycle).style = "pkp_body"
        worksheet.merge_cells(start_row=row_number, start_column=2, end_row=row_number, end_column=8)
        worksheet.cell(row=row_number, column=2, value=lifecycle_explanations[lifecycle]).style = "pkp_body"
        worksheet.cell(row=row_number, column=1).font = Font(name="Aptos", size=9, bold=True, color=NAVY)
        worksheet.cell(row=row_number, column=1).border = Border(bottom=THIN_GREY)
        worksheet.cell(row=row_number, column=2).border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 42

    add_section_band(worksheet, 42, "Category taxonomy", 1, 8)
    categories = dataset["taxonomy"]
    for index, category in enumerate(categories):
        row_number = 43 + index // 2
        column = 1 if index % 2 == 0 else 5
        worksheet.merge_cells(
            start_row=row_number,
            start_column=column,
            end_row=row_number,
            end_column=column + 2,
        )
        cell = worksheet.cell(row=row_number, column=column, value=category)
        cell.fill = PatternFill("solid", fgColor=PALE_BLUE if index % 2 == 0 else PALE_TEAL)
        cell.font = Font(name="Aptos", size=9, bold=True, color=NAVY)
        cell.alignment = Alignment(vertical="center", horizontal="left", wrap_text=True)
        cell.border = Border(bottom=THIN_GREY)
        worksheet.row_dimensions[row_number].height = 29

    widths = {"A": 28, "B": 20, "C": 26, "D": 3, "E": 28, "F": 20, "G": 26, "H": 3}
    for column, width in widths.items():
        worksheet.column_dimensions[column].width = width
    worksheet.freeze_panes = "A4"
    worksheet.print_title_rows = "1:2"
    worksheet.print_area = f"A1:H{43 + math.ceil(len(categories) / 2) - 1}"
    return worksheet


def create_workbook() -> Workbook:
    """Assemble every workbook sheet from the audited intermediates."""
    dataset = read_json("research_dataset.json")
    audit = read_json("audit_summary.json")
    evidence = read_csv("evidence_register.csv")
    sources = read_csv("source_register.csv")
    exclusions = read_csv("exclusion_log.csv")
    watchlist = read_csv("watchlist.csv")
    briefings = read_csv("briefing_units.csv")
    inventory = read_csv("dataset_inventory.csv")
    gaps = read_csv("coverage_gaps.csv")

    inventory_hashes = {row["source_file"]: row["sha256"] for row in inventory}
    enriched_briefings: list[dict[str, str]] = []
    for row in briefings:
        enriched = dict(row)
        enriched["source_file_sha256"] = inventory_hashes.get(row["source_file"], "")
        enriched_briefings.append(enriched)

    counts = {
        "evidence": len(evidence),
        "sources": len(sources),
        "exclusions": len(exclusions),
        "watchlist": len(watchlist),
        "briefings": len(briefings),
        "inventory": len(inventory),
        "gaps": len(gaps),
    }

    workbook = Workbook()
    register_named_styles(workbook)
    set_workbook_properties(workbook)
    build_read_me(workbook, dataset=dataset, counts=counts)

    evidence_widths = {
        "event_id": 29,
        "normalized_event_title": 40,
        "category": 26,
        "institution": 32,
        "geography": 22,
        "event_date": 22,
        "publication_date": 24,
        "first_detected": 22,
        "last_updated": 18,
        "briefing_file_references": 30,
        "primary_source_ids": 18,
        "primary_source_urls": 48,
        "corroborating_source_ids": 18,
        "corroborating_source_urls": 44,
        "status": 36,
        "verified_facts": 52,
        "source_claims": 42,
        "what_changed": 38,
        "significance": 38,
        "analytical_interpretation": 42,
        "forward_implications": 38,
        "confidence": 11,
        "confidence_reason": 34,
        "unresolved_issues": 34,
        "inclusion_decision": 30,
        "lifecycle": 27,
    }
    evidence_sheet = add_data_sheet(
        workbook,
        name="Evidence Register",
        subtitle=(
            "One row per distinct event or retained baseline/context record. Facts, "
            "claims, analysis, implications, uncertainty, and lifecycle remain separate."
        ),
        rows=evidence,
        table_name="tblEvidenceRegister",
        widths=evidence_widths,
        freeze_cell="F5",
        tab_color=GOLD,
        row_height_cap=146,
        link_fields={"primary_source_urls", "corroborating_source_urls"},
    )
    apply_evidence_rules(evidence_sheet, 4 + len(evidence))

    build_coverage_sheet(
        workbook,
        audit=audit,
        gaps=gaps,
        briefing_count=len(briefings),
    )

    add_data_sheet(
        workbook,
        name="Exclusions",
        subtitle="Items excluded, deduplicated, or bounded out of the evidence register, with the reason and disposition retained.",
        rows=exclusions,
        table_name="tblExclusions",
        widths={"item_id": 12, "item": 38, "type": 28, "reason": 60, "disposition": 38},
        freeze_cell="B5",
        tab_color="A35D5A",
        row_height_cap=88,
    )

    add_data_sheet(
        workbook,
        name="Briefing Units",
        subtitle="Normalized B001–B014 source provenance with exact filenames/subunits, UTC and PKT windows, timing issues, and source-file SHA-256.",
        rows=enriched_briefings,
        table_name="tblBriefingUnits",
        widths={
            "briefing_id": 12,
            "source_file": 48,
            "source_subunit": 16,
            "nominal_date": 14,
            "window_start_utc": 22,
            "window_end_utc": 22,
            "window_start_pkt": 22,
            "window_end_pkt": 22,
            "timestamp_basis": 42,
            "timing_issues": 54,
            "source_file_sha256": 36,
        },
        freeze_cell="D5",
        tab_color=TEAL,
        row_height_cap=96,
    )

    add_data_sheet(
        workbook,
        name="Sources",
        subtitle="S001–S111 primary and corroborating records with visible plain-text URLs, date fields, access status, and source-specific limitations.",
        rows=sources,
        table_name="tblSources",
        widths={
            "source_id": 11,
            "publisher": 30,
            "document_title": 48,
            "url": 58,
            "source_type": 30,
            "publication_date": 28,
            "event_date": 26,
            "access_date_utc": 16,
            "availability": 20,
            "limitations": 58,
        },
        freeze_cell="D5",
        tab_color=TEAL,
        row_height_cap=110,
        link_fields={"url"},
    )

    add_data_sheet(
        workbook,
        name="Watchlist",
        subtitle="Future dates and triggers that require human re-verification; listing does not imply completion or occurrence.",
        rows=watchlist,
        table_name="tblWatchlist",
        widths={
            "watch_id": 11,
            "date_or_trigger": 24,
            "topic": 42,
            "what_to_verify": 62,
            "source_id": 12,
            "source_url": 58,
        },
        freeze_cell="C5",
        tab_color=GOLD,
        row_height_cap=105,
        link_fields={"source_url"},
    )

    inventory_sheet = add_data_sheet(
        workbook,
        name="File Inventory",
        subtitle="Every received top-level file, with format, size, timestamps, SHA-256, readability, apparent coverage, and inclusion decision.",
        rows=inventory,
        table_name="tblFileInventory",
        widths={
            "source_file": 48,
            "format": 10,
            "detected_type": 36,
            "bytes": 14,
            "filesystem_birthtime": 22,
            "filesystem_mtime": 22,
            "sha256": 36,
            "readable": 12,
            "container_status": 20,
            "internal_title": 42,
            "internal_creator": 24,
            "internal_created": 22,
            "internal_modified": 22,
            "apparent_briefing_units": 18,
            "apparent_coverage_utc": 36,
            "inclusion_decision": 28,
            "notes": 52,
        },
        freeze_cell="D5",
        tab_color="657885",
        row_height_cap=100,
    )
    apply_inventory_rules(inventory_sheet, 4 + len(inventory))

    build_methodology_sheet(workbook, dataset=dataset)

    # Preserve the WHO mutable-record conflict in direct view and prevent accidental
    # truncation of important source-state fields.
    for row in range(5, evidence_sheet.max_row + 1):
        if evidence_sheet.cell(row=row, column=1).value == "EVT-PROC-20260828-WHO-BALOCHISTAN-GIS":
            evidence_sheet.cell(row=row, column=7).fill = PatternFill("solid", fgColor=PALE_AMBER)
            evidence_sheet.cell(row=row, column=7).font = Font(name="Aptos", size=10, bold=True, color="76520F")
            evidence_sheet.cell(row=row, column=7).comment = Comment(
                "Captured briefing B006 says 24 August 2026; current mutable UNGM page displays 28 August 2026. Both versions are retained.",
                AUTHOR,
            )
            break

    source_sheet = workbook["Sources"]
    for row in range(5, source_sheet.max_row + 1):
        if source_sheet.cell(row=row, column=1).value == "S047":
            for column in (6, 10):
                source_sheet.cell(row=row, column=column).fill = PatternFill("solid", fgColor=PALE_AMBER)
                source_sheet.cell(row=row, column=column).font = Font(name="Aptos", size=9, bold=True, color="76520F")
            source_sheet.cell(row=row, column=6).comment = Comment(
                "The live UNGM page is mutable. This workbook preserves the earlier B006 capture and the currently displayed date without choosing one as silently authoritative.",
                AUTHOR,
            )
            break

    workbook.active = 0
    return workbook


def save_workbook(workbook: Workbook) -> Path:
    """Atomically save exactly one final workbook to the required output path."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_PATH.with_suffix(".building")
    workbook.save(temporary)
    os.replace(temporary, OUTPUT_PATH)
    return OUTPUT_PATH


def main() -> None:
    """Build and save the workbook, then report the single artifact path."""
    workbook = create_workbook()
    output = save_workbook(workbook)
    print(output)


if __name__ == "__main__":
    main()
