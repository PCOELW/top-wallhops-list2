#!/usr/bin/env python3
"""TTWL Victors importer: notes on column M of Top PC Wallhops / Legacy List (PC).

The title must come from column B on the very same row. Mobile and visible
column-M cell values must never be used: on the source workbook they contain
non-Victor descriptions that led to fake player names in the published JSON.

This uses the XLSX export's Excel comments, not Google Sheets cell values.
Google may omit some notes from public exports; report that explicitly.
"""
import argparse
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from urllib.request import Request, urlopen

SOURCE_ID = os.environ.get('TTWL_VICTORS_SHEET_ID') or os.environ.get('TTWL_SOURCE_SHEET_ID') or '1IL_rmiXINST07Hb04RX3qpfQ2pM98FBqnxWwN4Xt7o0'
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'
CELL = re.compile(r'^([A-Z]+)(\d+)$')
TITLE_NUMBER = re.compile(r'^\s*\d+(?:\.0+)?\s*$')
LABEL = re.compile(r'^\s*(?:victors?|winners?|clearers?|클리어자)\s*[:：=\-–]?\s*', re.I)
BAD_NOTE = re.compile(r'\b(?:tower\s+creator\s+id|obby\s+creator\s+id|gameplay\s+style|\d+\s*(?:seconds?|minutes?|studs?))\b', re.I)
# Roblox usernames, not ordinary prose; no whitespace, punctuation, or hyphens.
ROBLOX_NAME = re.compile(r'^[A-Za-z0-9_]{3,20}$')
COMMON_PROSE = {'this', 'that', 'seconds', 'second', 'minute', 'minutes', 'gameplay', 'headbumps',
                'wallhops', 'wallhop', 'tower', 'obby', 'mostly', 'mainly', 'made', 'just',
                'fast', 'slow', 'like', 'with', 'from', 'only', 'here', 'and', 'for', 'the',
                'not', 'are', 'you', 'have', 'more', 'less', 'time'}
TABS = {
    os.environ.get('WALLHOPS_PC_TAB', 'Top PC Wallhops').strip().casefold(): 'pc',
    os.environ.get('WALLHOPS_LEGACY_TAB', 'Legacy List (PC)').strip().casefold(): 'legacy',
}


def canonical(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).casefold()


def usernames(raw):
    """Parse whitespace/comma-separated Roblox usernames from a note, never prose."""
    text = str(raw or '').strip()
    if not text or BAD_NOTE.search(text):
        return []
    text = LABEL.sub('', text)
    pieces = re.split(r'[\s,;，、]+', text)
    names, seen = [], set()
    for piece in pieces:
        word = piece.strip(' \t\r\n\"\'[]()')
        if not word:
            continue
        # Reject the whole cell instead of collecting random words from a sentence.
        if not ROBLOX_NAME.fullmatch(word) or word.casefold() in COMMON_PROSE:
            return []
        if word.casefold() not in seen:
            names.append(word)
            seen.add(word.casefold())
    return names


def relations(zf, path):
    folder, name = posixpath.split(path)
    rel_path = posixpath.join(folder, '_rels', name + '.rels')
    if rel_path not in zf.namelist():
        return {}
    result = {}
    for rel in ET.fromstring(zf.read(rel_path)).findall(PKG + 'Relationship'):
        target = rel.attrib.get('Target', '')
        if rel.attrib.get('TargetMode') != 'External':
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(folder, target))
        result[rel.attrib.get('Id')] = target
    return result


def shared_strings(zf):
    if 'xl/sharedStrings.xml' not in zf.namelist():
        return []
    root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
    return [''.join(t.text or '' for t in element.iter(S+'t')) for element in root.findall(S+'si')]


def value(cell, shared):
    kind = cell.attrib.get('t', '')
    if kind == 'inlineStr':
        e = cell.find(S+'is')
        return ''.join(t.text or '' for t in e.iter(S+'t')) if e is not None else ''
    v = cell.find(S+'v')
    raw = (v.text or '') if v is not None else ''
    if kind == 's':
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            return ''
    return raw


def comments(zf, sheet_path):
    """Only actual XLSX comments/notes, NOT displayed values in M."""
    found = {}
    for target in set(relations(zf, sheet_path).values()):
        if target not in zf.namelist() or not re.search(r'(?:^|/)(?:comments|threadedcomments)', target, re.I):
            continue
        root = ET.fromstring(zf.read(target))
        for node in root.iter():
            if node.tag.rsplit('}', 1)[-1] not in ('comment', 'threadedComment'):
                continue
            address = node.attrib.get('ref', '').upper()
            if not CELL.fullmatch(address):
                continue
            text = ''.join((t.text or '') for t in node.iter() if t.tag.rsplit('}', 1)[-1] == 't').strip()
            if not text:
                text = ''.join((t.text or '') for t in node.iter() if t.tag.rsplit('}', 1)[-1] == 'text').strip()
            if text:
                found[address] = text
    return found


def add(players, title, names):
    key = canonical(title)
    if not key or not names:
        return
    group = players.setdefault(key, [])
    seen = {n.casefold() for n in group}
    for name in names:
        if name.casefold() not in seen:
            group.append(name)
            seen.add(name.casefold())


def extract(blob):
    result = {'pc': {}, 'mobile': {}, 'legacy': {}, 'all': {}}
    diagnostic = {'recognizedTabs': [], 'titles': {'pc': 0, 'legacy': 0},
                  'allNotes': {'pc': 0, 'legacy': 0}, 'mNotes': {'pc': 0, 'legacy': 0},
                  'rejectedMNotes': {'pc': 0, 'legacy': 0}}
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        sheets = ET.fromstring(zf.read('xl/workbook.xml'))
        rels = relations(zf, 'xl/workbook.xml')
        strings = shared_strings(zf)
        for sheet in sheets.findall('./'+S+'sheets/'+S+'sheet'):
            label = sheet.attrib.get('name', '')
            platform = TABS.get(label.strip().casefold())
            if platform not in ('pc', 'legacy'):
                continue  # Mobile is deliberately excluded.
            path = rels.get(sheet.attrib.get(R+'id'))
            if not path or path not in zf.namelist():
                print(f'WARNING: cannot read worksheet path for {label}', file=sys.stderr)
                continue
            diagnostic['recognizedTabs'].append(label)
            root = ET.fromstring(zf.read(path))
            titles = {}
            for row in root.findall('./'+S+'sheetData/'+S+'row'):
                number = int(row.attrib.get('r', '0'))
                if number < 3:
                    continue
                # Read B only; ignore all other values, particularly M/N.
                title = ''
                for cell in row.findall(S+'c'):
                    if cell.attrib.get('r', '').upper() == f'B{number}':
                        title = value(cell, strings).strip()
                        break
                if title and not TITLE_NUMBER.fullmatch(title) and canonical(title) not in {'wallhop title', 'title'}:
                    titles[number] = title
            diagnostic['titles'][platform] = len(titles)
            notes = comments(zf, path)
            diagnostic['allNotes'][platform] = len(notes)
            for address, note in notes.items():
                match = CELL.fullmatch(address)
                if not match or match.group(1) != 'M':
                    continue
                number = int(match.group(2))
                if number not in titles:
                    continue
                diagnostic['mNotes'][platform] += 1
                names = usernames(note)
                if not names:
                    diagnostic['rejectedMNotes'][platform] += 1
                    continue
                add(result[platform], titles[number], names)
    return result, diagnostic


def run(input_file=None):
    if input_file:
        payload = Path(input_file).read_bytes()
    else:
        request = Request(f'https://docs.google.com/spreadsheets/d/{SOURCE_ID}/export?format=xlsx',
                          headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(request, timeout=50) as response:
            payload = response.read(30 * 1024 * 1024 + 1)
    if len(payload) > 30 * 1024 * 1024:
        raise ValueError('XLSX export exceeds 30 MB.')
    if not payload.startswith(b'PK'):
        raise ValueError('Source did not return an XLSX. Check sharing/download permissions.')
    records, diagnostic = extract(payload)
    print('Victors notes diagnostic: ' + json.dumps(diagnostic, ensure_ascii=False), file=sys.stderr)
    if not diagnostic['recognizedTabs']:
        raise ValueError('Neither Top PC Wallhops nor Legacy List (PC) was found. Check the exact tab names.')
    total = len(records['pc']) + len(records['legacy'])
    if not total:
        raise ValueError('No usable M-column NOTES found in PC/Legacy. Visible M-cell text was intentionally ignored. '
                         'Check if notes survive Google Sheets XLSX export (see diagnostic above).')
    missing = [p for p in ('pc', 'legacy') if diagnostic['titles'][p] and not records[p]]
    if missing:
        print(f'WARNING: no usernames could be extracted from {", ".join(missing)} M-cell notes.', file=sys.stderr)
    return {
        'status': 'partial' if missing else 'live',
        'updatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'sourceUrl': f'https://docs.google.com/spreadsheets/d/{SOURCE_ID}/edit',
        'pc': records['pc'], 'mobile': {}, 'legacy': records['legacy'], 'all': {},
        'wallhopCount': total, 'noteCount': sum(diagnostic['allNotes'].values()),
        'mNoteCount': sum(diagnostic['mNotes'].values()), 'diagnostic': diagnostic,
        'message': f'No extractable notes in: {", ".join(missing)}' if missing else '',
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', help='Optional local XLSX file for tests.')
    parser.add_argument('--output', default='data/victors.json')
    args = parser.parse_args()
    try:
        data = run(args.input)
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Victor sync: pc={len(data["pc"])} legacy={len(data["legacy"])} mobile=0 ({data["status"]}).')
    except Exception as error:
        print(f'Victor sync failed: {error}', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
