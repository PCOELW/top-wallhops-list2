#!/usr/bin/env python3
"""Non-destructively hook Victor UI + sheet source into the built site.

Runs on _site only. Leaves original tracked user customizations unchanged.
"""
from pathlib import Path
import re

SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1IL_rmiXINST07Hb04RX3qpfQ2pM98FBqnxWwN4Xt7o0/edit'

root = Path('_site')
html_file = root / 'index.html'
config_file = root / 'config.js'

if not html_file.is_file() or not config_file.is_file():
    raise SystemExit('Missing _site/index.html or _site/config.js')

html = html_file.read_text(encoding='utf-8')
if not re.search(r'(?:\./)?victors\.css\b', html, re.I):
    html, n = re.subn(r'</head\s*>', '  <link rel="stylesheet" href="./victors.css">\n</head>', html, count=1, flags=re.I)
    if not n: raise SystemExit('Missing </head> in website HTML')

if not re.search(r'(?:\./)?victors\.js\b', html, re.I):
    html, n = re.subn(r'</body\s*>', '  <script defer src="./victors.js"></script>\n</body>', html, count=1, flags=re.I)
    if not n: raise SystemExit('Missing </body> in website HTML')

html_file.write_text(html, encoding='utf-8')

config = config_file.read_text(encoding='utf-8')
# Force the new spreadsheet source for the direct (30s) Google Sheets reader.
addition = (
    '\n/* TTWL linked source sheet -- generated for deployment. */\n'
    "window.WALLHOPS_CONFIG = window.WALLHOPS_CONFIG || {};\n"
    f"window.WALLHOPS_CONFIG.spreadsheetUrl = '{SOURCE_URL}';\n"
)
marker = '/* TTWL linked source sheet -- generated for deployment. */'
if marker in config:
    config = config.split(marker)[0].rstrip() + '\n'
config_file.write_text(config + addition, encoding='utf-8')

print('Ready: index.html loads victors.css/victors.js; config.js reads new spreadsheet.')
