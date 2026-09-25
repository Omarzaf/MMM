#!/usr/bin/env python3
"""Remove native Excel's optional local save-path metadata from the final XLSX."""

from __future__ import annotations

import os
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "outputs" / "01a0653c-96d7-7c92-918b-3975d6716164" / (
    "Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_"
    "2026-08-18_to_2026-09-03.xlsx"
)
TEMPORARY = WORKBOOK.with_suffix(".sanitizing")
ABSOLUTE_PATH_BLOCK = re.compile(
    rb'<mc:AlternateContent xmlns:mc="http://schemas\.openxmlformats\.org/'
    rb'markup-compatibility/2006"><mc:Choice Requires="x15"><x15ac:absPath '
    rb'url="[^"]*" xmlns:x15ac="http://schemas\.microsoft\.com/office/'
    rb'spreadsheetml/2010/11/ac"/></mc:Choice></mc:AlternateContent>'
)


def main() -> None:
    """Rewrite the package atomically while preserving all non-target ZIP parts."""
    if not WORKBOOK.is_file():
        raise FileNotFoundError(WORKBOOK)
    mode = WORKBOOK.stat().st_mode

    with ZipFile(WORKBOOK, "r") as source:
        if source.testzip() is not None:
            raise ValueError("Workbook package fails its CRC check")
        workbook_xml = source.read("xl/workbook.xml")
        sanitized, replacements = ABSOLUTE_PATH_BLOCK.subn(b"", workbook_xml)
        if replacements != 1:
            raise ValueError(f"Expected one Excel absPath block; found {replacements}")

        with ZipFile(TEMPORARY, "w", compression=ZIP_DEFLATED) as target:
            for entry in source.infolist():
                payload = sanitized if entry.filename == "xl/workbook.xml" else source.read(entry.filename)
                target.writestr(entry, payload)

    with ZipFile(TEMPORARY, "r") as candidate:
        if candidate.testzip() is not None:
            raise ValueError("Sanitized workbook package fails its CRC check")
        if any(b"/Users/" in candidate.read(name) for name in candidate.namelist()):
            raise ValueError("A local macOS path remains in the workbook package")

    os.chmod(TEMPORARY, mode)
    os.replace(TEMPORARY, WORKBOOK)
    print(f"Sanitized native Excel path metadata: {WORKBOOK.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
