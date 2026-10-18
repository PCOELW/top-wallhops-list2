#!/usr/bin/env python3
"""Extract space-separated Victor usernames from cell notes of a public Google Sheet.

No Apps Script, service account, or third-party dependencies. Notes are only
accessible when Google's anonymous XLSX export includes their Excel comments.
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

SHEET_ID = os.environ.get('TTWL_VICTORS_SHEET_ID', '1RwF0kxkdXh_Fk49zBLWJx1pGxVBLEtnRJK74gvSwzWo')
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'
CELL = re.compile(r'^([A-Z]+)(\d+)$')
VICTOR_WORD = re.compile(r'\bvictors?\b', re.I)
VICTOR_LABEL = re.compile(r'(?:^|[\n\r])\s*(?:victors?|winners?)\s*[:：=\-–]?\s*', re.I)
NAME = re.compile(r'^[\w.\-]{2,40}$', re.UNICODE)
NOISE = re.compile(r'\b(tower\s+creator\s+id|date\s*\(|rules?|verified\s+by)\b', re.I)


def key(value):
    return ' '.join(str(value or '').strip().lower().split())


def usernames(raw):
    """Each whitespace-delimited nickname is a separate person."""
    text = str(raw or '').strip()
    text = VICTOR_LABEL.sub('', text)
    text = re.sub(r'(?i)^\s*(?:victors?|winners?)\s*[:：=\-–]?\s*', '', text)
    tokens = re.split(r'[\s,;，、]+', text)
    clean, seen = [], set()
    for token in tokens:
        t = token.strip(' \t\r\n\"\'[]()')
        if NAME.fullmatch(t) and t.lower() not in seen:
            clean.append(t)
            seen.add(t.lower())
    return clean


def relationships(zf, path):
    folder, filename = posixpath.split(path)
    relpath = posixpath.join(folder, '_rels', filename + '.rels')
    if relpath not in zf.namelist():
        return {}
    out = {}
    for rel in ET.fromstring(zf.read(relpath)).findall(PKG + 'Relationship'):
        target = rel.attrib.get('Target', '')
        if rel.attrib.get('TargetMode') != 'External':
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(folder, target))
        out[rel.attrib.get('Id')] = target
    return out


def read_notes(zf, sheetrels):
    notes = {}
    for path in set(sheetrels.values()):
        if path not in zf.namelist() or not re.search(r'(?:^|/)(?:comments|threadedcomments)', path, re.I):
            continue
        root = ET.fromstring(zf.read(path))
        for c in root.iter():
            if c.tag.rsplit('}', 1)[-1] not in ('comment','threadedComment'):
                continue
            ref = c.attrib.get('ref','').upper()
            if not CELL.fullmatch(ref):
                continue
            text = ''.join((node.text or '') for node in c.iter() if node.tag.rsplit('}',1)[-1] == 't').strip()
            if not text:
                text = ''.join((node.text or '') for node in c.iter() if node.tag.rsplit('}',1)[-1] == 'text').strip()
            if text:
                notes[ref] = text
    return notes


def shared_strings(zf):
    if 'xl/sharedStrings.xml' not in zf.namelist():
        return []
    root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
    return [''.join(n.text or '' for n in item.iter(S+'t')) for item in root.findall(S+'si')]


def cell_value(cell, shared):
    kind = cell.attrib.get('t','')
    if kind == 'inlineStr':
        s = cell.find(S+'is')
        return ''.join(n.text or '' for n in s.iter(S+'t')) if s is not None else ''
    v = cell.find(S+'v')
    result = (v.text or '') if v is not None else ''
    if kind == 's':
        try: return shared[int(result)]
        except (ValueError, IndexError): return ''
    return result


def identify_platform(sheet_name):
    if re.search(r'\bmobile\b|모바일',sheet_name,re.I): return 'mobile'
    if re.search(r'\bpc\b|컴퓨터',sheet_name,re.I): return 'pc'
    return 'all'


def add(map_, title, candidates):
    k = key(title)
    if not k or not candidates: return
    prior = map_.setdefault(k, [])
    for name in candidates:
        if name.lower() not in {x.lower() for x in prior}:
            prior.append(name)


def extract(payload):
    zf = zipfile.ZipFile(io.BytesIO(payload))
    with zf:
        workbook = ET.fromstring(zf.read('xl/workbook.xml'))
        rels = relationships(zf,'xl/workbook.xml')
        strings = shared_strings(zf)
        output = {'pc': {}, 'mobile': {}, 'all': {}}
        found_notes = 0
        for entry in workbook.findall('./'+S+'sheets/'+S+'sheet'):
            label = entry.attrib.get('name','')
            path = rels.get(entry.attrib.get(R+'id'))
            if not path or path not in zf.namelist(): continue
            platform = identify_platform(label)
            root = ET.fromstring(zf.read(path))
            cells = {}
            for row in root.findall('./'+S+'sheetData/'+S+'row'):
                r = int(row.attrib.get('r','0'))
                cells[r] = {c.attrib.get('r','').upper():cell_value(c,strings).strip() for c in row.findall(S+'c')}
            # Header detection supports sheets whose Victors column is not in a fixed position.
            victor_cols=set()
            title_col='B'
            for r in range(1, min(max(cells or {0:0}), 8)+1):
                for address, value in cells.get(r,{}).items():
                    m=CELL.fullmatch(address)
                    if not m: continue
                    if re.fullmatch(r'\s*victors?(?:\s*\([^)]*\))?\s*',value,re.I):victor_cols.add(m.group(1))
                    if re.fullmatch(r'\s*(?:wallhop\s*title|wallhop\s*name|tower\s*name|title)\s*',value,re.I):title_col=m.group(1)
            notes = read_notes(zf,relationships(zf,path))
            found_notes += len(notes)
            byrow = {}
            for r, row in cells.items():
                title = row.get(f'{title_col}{r}', '') or row.get(f'B{r}','')
                if not title or title.lower() in ('wallhop title','title','wallhop name'):
                    continue
                byrow[r] = title
                # Also support a visible Victors column, if one exists.
                for col in victor_cols:
                    raw = row.get(f'{col}{r}', '')
                    if raw: add(output[platform], title, usernames(raw))
            for address, note in notes.items():
                m=CELL.fullmatch(address)
                if not m:continue
                col, r = m.group(1), int(m.group(2))
                title=byrow.get(r)
                if not title:continue
                value=cells.get(r,{}).get(address,'')
                named=bool(VICTOR_WORD.search(note))
                in_column=col in victor_cols
                labelled=bool(VICTOR_WORD.search(value))
                # If the note contains only plain usernames, also accept it if
                # the attached cell's visible label says Victor(s).
                if not (named or in_column or labelled):continue
                if NOISE.search(note):continue
                if named:
                    # Strip the Victor heading, not other prose, before splitting.
                    note = re.sub(r'(?i)\bvictors?\s*[:：=\-–]?\s*',' ',note)
                add(output[platform],title,usernames(note))
        return output,found_notes


def run(input_file=None):
    if input_file: content=Path(input_file).read_bytes()
    else:
        request=Request(f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx',headers={'User-Agent':'Mozilla/5.0'})
        with urlopen(request,timeout=50) as response:
            content=response.read(30*1024*1024+1)
    if len(content)>30*1024*1024: raise ValueError('XLSX too large')
    if not content.startswith(b'PK'): raise ValueError('Google returned non-XLSX content; check anonymous download permission')
    records, total_notes=extract(content)
    found=sum(len(x) for x in records.values())
    if not found:
        raise ValueError(f'No Victor entries extracted from XLSX (notes found: {total_notes}). Check the note labels, cell layout, and XLSX export support.')
    return {'status':'live','updatedAt':datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'sourceUrl':f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit',
            'pc':records['pc'],'mobile':records['mobile'],'all':records['all'],
            'message': 'Found no matching Victor notes; check source note placement or XLSX export.' if not found else '',
            'noteCount':total_notes,'wallhopCount':found}


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--input')
    p.add_argument('--output',default='data/victors.json')
    options=p.parse_args()
    try:
        data=run(options.input)
        target=Path(options.output)
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(f"Victor sync: {data['wallhopCount']} wallhops, {data['noteCount']} notes")
    except Exception as exc:
        print(f'Victor sync failed: {exc}',file=sys.stderr)
        raise SystemExit(1)

if __name__=='__main__':main()
