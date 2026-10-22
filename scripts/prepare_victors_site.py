#!/usr/bin/env python3
"""Validate one-sheet JSON and align the built site's 30-second client config.

Modifies _site only, never overwrites tracked index.html/config.js or the user's styles.
"""
import json
import os
from pathlib import Path
import re

SID = os.environ.get('TTWL_SOURCE_SHEET_ID', '1IL_rmiXINST07Hb04RX3qpfQ2pM98FBqnxWwN4Xt7o0')
SOURCE_URL = f'https://docs.google.com/spreadsheets/d/{SID}/edit'
root = Path('_site')


def verify(name):
    path = root / 'data' / name
    if not path.is_file():
        raise SystemExit(f'Missing generated data file: {path}')
    data = json.loads(path.read_text(encoding='utf-8'))
    source = str(data.get('sourceUrl', ''))
    if f'/d/{SID}/' not in source:
        raise SystemExit(f'WRONG SOURCE in {path}: {source!r}. Expected ONLY {SID}.')
    if not isinstance(data.get('pc'), (list, dict)) or not isinstance(data.get('mobile'), (list, dict)):
        raise SystemExit(f'Incorrect PC/Mobile data structure in {path}')
    if name == 'rankings.json' and not isinstance(data.get('legacy'), list):
        raise SystemExit(f'Missing Legacy rankings array in {path}')
    return data


rankings = verify('rankings.json')
victors = verify('victors.json')

# The workflow's no-notes fallback predates the Legacy List. Always publish a
# valid Legacy section even when Google's XLSX export has no accessible notes.
if 'legacy' not in victors:
    victors['legacy'] = {}
if not isinstance(victors['legacy'], dict):
    raise SystemExit('Invalid Victors legacy data; expected title-to-names mapping')
(root / 'data' / 'victors.json').write_text(json.dumps(victors, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


# This protects against publishing repeated ranks/titles, even if XLSX/CSV input had duplicates.
def canonical(title):
    cleaned = re.sub(r'^\s*\d+\s*[).]\s*', '', str(title or ''))
    return re.sub(r'\s+', ' ', cleaned).strip().casefold()

for platform in ('pc', 'mobile', 'legacy'):
    items = rankings[platform]
    if not isinstance(items, list):
        raise SystemExit(f'Expected {platform} rankings array')
    ranks, names, output = set(), set(), []
    # Preserve incoming sheet order; sorting by title here could select
    # a stale conflicting record simply because its name comes first.
    for item in items:
        rank = int(item.get('rank', 0))
        name = canonical(item.get('title'))
        if rank <= 0 or not name or rank in ranks or name in names:
            continue
        output.append(item)
        ranks.add(rank)
        names.add(name)
    if len(output) != len(items):
        print(f'WARNING: cleaned {len(items) - len(output)} duplicate {platform} ranking row(s).')
        rankings[platform] = output

(root / 'data' / 'rankings.json').write_text(json.dumps(rankings, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

# Keep the existing user's HTML exactly, merely wire the Victors scripts if needed.
html_path = root / 'index.html'
config_path = root / 'config.js'
if not html_path.exists() or not config_path.exists():
    raise SystemExit('Missing index.html/config.js in built site')
html = html_path.read_text(encoding='utf-8')
if (root / 'victors.css').is_file() and not re.search(r'(?:\./)?victors\.css\b', html, re.I):
    html = re.sub(r'</head\s*>', '<link rel="stylesheet" href="./victors.css">\n</head>', html, count=1, flags=re.I)
if (root / 'victors.js').is_file() and not re.search(r'(?:\./)?victors\.js\b', html, re.I):
    html = re.sub(r'</body\s*>', '<script defer src="./victors.js"></script>\n</body>', html, count=1, flags=re.I)
html_path.write_text(html, encoding='utf-8')

# Legacy on index.html is installed dynamically, but rules.html is a separate
# page. Patch only its navigation, preserving all existing rules text/design.
rules_path = root / 'rules.html'
if rules_path.is_file():
    rules_html = rules_path.read_text(encoding='utf-8')
    if not re.search(r'href\s*=\s*["\'](?:\./)?index\.html#legacy["\']', rules_html, re.I):
        mobile_link = re.compile(
            r'(<a\b(?=[^>]*\bhref\s*=\s*["\'](?:\./)?index\.html#mobile["\'])[^>]*>.*?</a>)',
            re.I | re.S,
        )
        legacy_link = '<a class="nav-item" href="./index.html#legacy">Legacy List</a>'
        rules_html, changed = mobile_link.subn(lambda m: m.group(1) + '\n      ' + legacy_link, rules_html, count=1)
        if changed != 1:
            raise SystemExit('Could not find Mobile Wallhops link in Rules navigation')
        # Do not write yet; also insert the Leaderboard item below.
    if not re.search(r'href\s*=\s*["\'](?:\./)?leaderboard\.html["\']', rules_html, re.I):
        legacy_nav = re.compile(
            r'(<a\b(?=[^>]*\bhref\s*=\s*["\'](?:\./)?index\.html#legacy["\'])[^>]*>.*?</a>)',
            re.I | re.S,
        )
        leaderboard_link = '<a class="nav-item" href="./leaderboard.html">Leaderboard</a>'
        rules_html, inserted = legacy_nav.subn(lambda m: m.group(1) + '\n      ' + leaderboard_link, rules_html, count=1)
        if inserted != 1:
            raise SystemExit('Could not insert Leaderboard link in Rules navigation')
    rules_path.write_text(rules_html, encoding='utf-8')


config = config_path.read_text(encoding='utf-8')
# Keep any Discord invite, title, colors, and UI settings in the existing config.
# Replace only old generated overrides and then append the canonical source LAST.
config = re.sub(r'/\* TTWL linked source sheet -- generated for deployment\. \*/.*?(?=/\* TTWL|\Z)', '', config, flags=re.S)
marker = '/* TTWL single source - generated by GitHub Actions. */'
config = config.split(marker)[0].rstrip()
config += f'''\n\n{marker}
window.WALLHOPS_CONFIG = window.WALLHOPS_CONFIG || {{}};
window.WALLHOPS_CONFIG.spreadsheetUrl = '{SOURCE_URL}';
window.WALLHOPS_CONFIG.sheetId = '{SID}';
window.WALLHOPS_CONFIG.pcSheetName = 'Top PC Wallhops';
window.WALLHOPS_CONFIG.mobileSheetName = 'Top Mobile Wallhops';
window.WALLHOPS_CONFIG.legacySheetName = 'Legacy List (PC)';
window.WALLHOPS_CONFIG.dataUrl = './data/rankings.json';
window.WALLHOPS_CONFIG.refreshMs = 30000;
'''
config_path.write_text(config, encoding='utf-8')
(root / 'data' / 'source-status.json').write_text(json.dumps({
    'sheetId': SID,
    'rankings':{'sourceUrl':rankings['sourceUrl'],'pcCount':len(rankings['pc']),'mobileCount':len(rankings['mobile']),'legacyCount':len(rankings['legacy'])},
    'victors':{'sourceUrl':victors['sourceUrl'],'status':victors.get('status','unknown')},
}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'SINGLE SOURCE VERIFIED: {SID}; PC={len(rankings["pc"])} Mobile={len(rankings["mobile"])} Legacy={len(rankings["legacy"])}; Victors={victors.get("status")}.')
