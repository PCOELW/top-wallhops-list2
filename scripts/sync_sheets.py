#!/usr/bin/env python3
"""Read a public, view-only Google Sheet, preserve XLSX hyperlinks, emit static JSON.

No Apps Script, OAuth token, service account, Google API key, or 3rd-party libs.
The source must be accessible to an anonymous GitHub Actions runner.
"""
import argparse
import csv
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import posixpath
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
import zipfile

SHEET_ID = os.environ.get("WALLHOPS_SHEET_ID", "1IL_rmiXINST07Hb04RX3qpfQ2pM98FBqnxWwN4Xt7o0")
TABS = {"pc": os.environ.get("WALLHOPS_PC_TAB", "Top PC Wallhops"),
        "mobile": os.environ.get("WALLHOPS_MOBILE_TAB", "Top Mobile Wallhops")}
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG = "{http://schemas.openxmlformats.org/package/2006/relationships}"
CELL_RE = re.compile(r"^([A-Za-z]+)([0-9]+)$")
# A cell note such as "Tower Creator id: 872867958#5" is a tower ID,
# not the place ID in the linked Roblox game URL.
TOWER_CREATOR_ID_RE = re.compile(r"\bTower\s*Creator\s*id\s*[:：]\s*([0-9]+(?:#[A-Za-z0-9_-]+)?)", re.I)
# Excel can save HYPERLINK as a formula instead of a hyperlink relationship.
HYPERLINK_RE = re.compile(r'^\s*(?:_xlfn\.)?HYPERLINK\s*\(\s*"((?:[^"]|"")+)"\s*[,;]', re.I)
COLS = {"rank":"A", "title":"B", "difficulty":"C", "tier":"D",
        "verifier":"E", "creator":"F", "gameUrl":"G", "videoUrl":"H", "style":"I", "attribute":"J", "quality":"K"}


def fetch(url):
    request = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; WallhopsList/1.0)",
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,*/*",
    })
    last_error = None
    for attempt in range(2):
        try:
            with urlopen(request, timeout=35) as res:
                if res.status != 200:
                    raise ValueError(f"HTTP {res.status}")
                result = res.read(28 * 1024 * 1024 + 1)
                if len(result) > 28 * 1024 * 1024:
                    raise ValueError("Source is larger than 28MB")
                return result
        except (HTTPError, URLError, TimeoutError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(2)
    raise ValueError(f"Cannot download source: {last_error}")


def col_number(ref):
    n = 0
    for char in ref.upper():
        n = n * 26 + ord(char) - 64
    return n


def safe_http_url(value):
    if not isinstance(value, str):
        return ""
    value = value.strip()
    return value if re.match(r"^https?://[^\s<>\"']+$", value, re.I) else ""


def rels_map(zf, filepath):
    """Read OPC relationship map for a document part."""
    folder, filename = posixpath.split(filepath)
    relpath = posixpath.join(folder, "_rels", filename + ".rels")
    if relpath not in zf.namelist():
        return {}
    out = {}
    for rel in ET.fromstring(zf.read(relpath)).findall(PKG + "Relationship"):
        target = rel.attrib.get("Target", "")
        if rel.attrib.get("TargetMode") != "External":
            if target.startswith("/"):
                target = target.lstrip("/")
            else:
                target = posixpath.normpath(posixpath.join(folder, target))
        out[rel.attrib.get("Id")] = target
    return out


def read_sheet_notes(zf, sheet_rels):
    """Read Google Sheets notes exported as Excel comment parts.

    Notes are not available from the public GViz value feed. Notes/legacy
    comments are mapped to A1 cell references using the worksheet rels.
    """
    notes = {}
    for path in set(sheet_rels.values()):
        lower = path.lower()
        if path not in zf.namelist() or not re.search(r"(?:^|/)(?:comments|threadedcomments)", lower):
            continue
        try:
            root = ET.fromstring(zf.read(path))
        except ET.ParseError:
            continue
        for elem in root.iter():
            kind = elem.tag.rsplit("}", 1)[-1]
            if kind not in ("comment", "threadedComment"):
                continue
            ref = elem.attrib.get("ref", "").upper()
            if not CELL_RE.match(ref):
                continue
            # Legacy <comment><text><t>...</t></text></comment>, and
            # threaded <threadedComment><text>...</text></threadedComment>.
            chunks = [node.text or "" for node in elem.iter() if node.tag.rsplit("}", 1)[-1] == "t"]
            if not chunks:
                chunks = [node.text or "" for node in elem.iter() if node.tag.rsplit("}", 1)[-1] == "text"]
            text = "".join(chunks).strip()
            if text:
                notes[ref] = text
    return notes


def get_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(S + "t")) for si in root.findall(S + "si")]


def extract_cell(cell, strings):
    kind = cell.attrib.get("t", "")
    if kind == "inlineStr":
        inline = cell.find(S + "is")
        return "".join(t.text or "" for t in inline.iter(S + "t")) if inline is not None else ""
    v = cell.find(S + "v")
    value = v.text if v is not None and v.text is not None else ""
    if kind == "s":
        try:
            return strings[int(value)]
        except (ValueError, IndexError):
            return ""
    if kind == "b":
        return "TRUE" if value == "1" else "FALSE"
    if kind == "str":
        return value
    if not value:
        return ""
    # Render numeric spreadsheet values without a redundant trailing ".0".
    try:
        return format(float(value), ".14g")
    except ValueError:
        return value


def read_xlsx(data):
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("The Google export was not a valid XLSX (perhaps sign-in required)") from exc
    with zf:
        if "xl/workbook.xml" not in zf.namelist():
            raise ValueError("XLSX workbook.xml was not found")
        strings = get_shared_strings(zf)
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        relationships = rels_map(zf, "xl/workbook.xml")
        outputs = {}
        for entry in wb.findall("./" + S + "sheets/" + S + "sheet"):
            title = entry.attrib.get("name", "")
            if title not in TABS.values():
                continue
            rid = entry.attrib.get(R + "id")
            target = relationships.get(rid, "")
            if not target or target not in zf.namelist():
                raise ValueError(f"Worksheet XML unavailable: {title} ({target})")
            page = ET.fromstring(zf.read(target))
            hyperlinks = {}
            sheet_rels = rels_map(zf, target)
            cell_notes = read_sheet_notes(zf, sheet_rels)
            for link in page.findall("./" + S + "hyperlinks/" + S + "hyperlink"):
                ref = link.attrib.get("ref", "").split(":")[0].upper()
                rel_id = link.attrib.get(R + "id")
                url = sheet_rels.get(rel_id, "") if rel_id else link.attrib.get("location", "")
                if safe_http_url(url):
                    hyperlinks[ref] = safe_http_url(url)
            row_map = {}
            for row in page.findall("./" + S + "sheetData/" + S + "row"):
                row_idx = int(row.attrib.get("r", "0"))
                if row_idx < 3:
                    continue
                cells = {}
                for cell in row.findall(S + "c"):
                    cell_ref = cell.attrib.get("r", "").upper()
                    match = CELL_RE.match(cell_ref)
                    if not match or col_number(match.group(1)) > 11:
                        continue
                    value = extract_cell(cell, strings)
                    # Prefer an explicit XML relationship over formula URL over literal URL.
                    formula = cell.find(S + "f")
                    f = (formula.text or "") if formula is not None else ""
                    fm = HYPERLINK_RE.search(f)
                    url = hyperlinks.get(cell_ref, "") or (fm.group(1).replace('""', '"') if fm else "")
                    cells[match.group(1)] = (value, safe_http_url(url))
                row_map[row_idx] = cells
            outputs[title] = records_from_rows(row_map, cell_notes)
        return outputs


def records_from_rows(rows, cell_notes=None):
    records = []
    for rindex, row in sorted(rows.items()):
        raw_rank = row.get("A", ("", ""))[0].strip()
        title = row.get("B", ("", ""))[0].strip()
        try:
            rank = int(float(raw_rank))
            if float(raw_rank) != rank or rank < 1:
                continue
        except (ValueError, OverflowError):
            continue
        if not title or rindex < 3:
            continue
        record = {"rank": rank, "title": title}
        for field, column in COLS.items():
            if field in ("rank", "title"):
                continue
            display, hyperlink = row.get(column, ("", ""))
            record[field] = (hyperlink or safe_http_url(display)) if field.endswith("Url") else display.strip()
        # Find Tower Creator ID in the Google Sheets note on the [GAME]
        # cell. The small black-corner tooltip seen in Sheets is a note,
        # separate from the Roblox hyperlink and visible cell text.
        notes = cell_notes or {}
        note = notes.get(f"G{rindex}", "")
        match = TOWER_CREATOR_ID_RE.search(note)
        record["towerCreatorId"] = match.group(1) if match else ""
        records.append(record)
    return sorted(records, key=lambda record: record["rank"])


def read_public_csv(tab):
    # gviz/tq CSV is anonymously readable for some public sheets even when /export is blocked.
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out%3Acsv&sheet={quote(tab)}"
    data = fetch(url)
    if b"<html" in data[:200].lower() or b"<!doctype" in data[:200].lower():
        raise ValueError(f"Google returned HTML instead of data for {tab}; public reading may be blocked")
    rows = {}
    for i, values in enumerate(csv.reader(io.StringIO(data.decode("utf-8-sig"))), 1):
        # Google Visualization may omit the sheet's first two decorative rows,
        # so rely on the numeric Rank and a nonempty Title, not a CSV line offset.
        rows[i + 2] = {chr(65 + j):(v, "") for j, v in enumerate(values[:11])}
    return records_from_rows(rows)


def attach_roblox_thumbnails(items):
    """Fetch thumbnail URLs for links of the form roblox.com/games/<placeId>."""
    import urllib.parse
    ids = {}
    for item in items:
        match = re.search(r"(?:www\.)?roblox\.com/games/(\d+)", item.get("gameUrl", ""), re.I)
        if match:
            ids.setdefault(match.group(1), []).append(item)
    if not ids:
        return
    keys = list(ids)
    for start in range(0, len(keys), 40):
        batch = keys[start:start+40]
        url = "https://thumbnails.roblox.com/v1/places/gameicons?placeIds=" + ",".join(batch) + "&size=150x150&format=Png&isCircular=false"
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=9) as response:
                payload = json.loads(response.read(1024 * 1024))
            for result in payload.get('data', []):
                place_id = str(result.get('targetId', ''))
                image_url = safe_http_url(result.get('imageUrl', ''))
                if image_url:
                    for item in ids.get(place_id, []):
                        item['thumbnailUrl'] = image_url
        except (HTTPError, URLError, TimeoutError, ValueError):
            continue


def sync(source_file=None):
    warnings = []
    if source_file:
        raw = Path(source_file).read_bytes()
    else:
        url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
        try:
            raw = fetch(url)
        except ValueError as exc:
            warnings.append(f"XLSX 내려받기 실패: {exc}")
            raw = b""
    origin = "xlsx"
    try:
        all_tabs = read_xlsx(raw)
        if not all(name in all_tabs for name in TABS.values()):
            raise ValueError(f"Missing PC/Mobile tab(s). Found: {', '.join(all_tabs.keys())}")
    except ValueError as exc:
        if source_file:
            raise
        warnings.append(str(exc))
        print(f"XLSX unavailable; trying public CSV per tab: {exc}", file=sys.stderr)
        origin = "csv"
        all_tabs = {}
        for name in TABS.values():
            all_tabs[name] = read_public_csv(name)
        warnings.append("CSV 대체 연결: 셀 속 [GAME]/[Link] 하이퍼링크가 누락될 수 있습니다.")
    pc, mobile = all_tabs[TABS["pc"]], all_tabs[TABS["mobile"]]
    if not pc and not mobile:
        raise ValueError("PC and Mobile sheets both yielded zero rankings. Check access and A/B columns.")
    if not pc or not mobile:
        warnings.append("PC 또는 Mobile 데이터가 비어 있습니다. 탭 이름과 A/B열 구조를 확인하세요.")
    # Optionally use Roblox game thumbnails. This is best-effort: errors never stop sync.
    # The source sheet doesn't contain an image column, so show a styled fallback otherwise.
    if not source_file:
        try:
            attach_roblox_thumbnails(pc + mobile)
        except Exception as exc:
            warnings.append(f"Roblox 썸네일은 일부 표시되지 않을 수 있습니다: {exc}")
    for label, items in [("PC", pc), ("Mobile", mobile)]:
        if any(not item["gameUrl"] or not item["videoUrl"] for item in items):
            warnings.append(f"{label}에서 일부 게임/영상 링크를 읽지 못했습니다. 원본 셀 또는 다운로드 형식을 확인하세요.")
    return {
        "status": "live", "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Google Sheets", "downloadFormat": origin,
        "sourceUrl": f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit",
        "warnings": warnings, "pc": pc, "mobile": mobile,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/rankings.json")
    parser.add_argument("--input", help="Optional local XLSX for testing")
    args = parser.parse_args()
    try:
        payload = sync(args.input)
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Success: PC {len(payload['pc'])}, Mobile {len(payload['mobile'])}, format {payload['downloadFormat']}")
        for item in payload["warnings"]:
            print("WARNING: " + item, file=sys.stderr)
    except Exception as exc:
        print("ERROR: Could not sync Google Sheet: " + str(exc), file=sys.stderr)
        print("The owner must enable anonymous viewing and downloading; a personal viewer login is not enough for GitHub Actions.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
