#!/usr/bin/env python3
"""Add SEO metadata and sitemap to the built GitHub Pages _site directory.

Run AFTER prepare_victors_site.py and BEFORE upload-pages-artifact.
Does not modify repository source HTML, data, JavaScript, or CSS.
"""
from __future__ import annotations

import html
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET

SITE = Path('_site')
BASE = 'https://pcoelw.github.io/ttwl/'
PAGES = {
    'index.html': {
        'url': BASE,
        'title': 'TTWL — The Top Wallhops List',
        'description': ('TTWL (The Top Wallhops List): browse PC Wallhops, Mobile Wallhops, '
                        'the Legacy List, ranks, difficulties, and verified clears.'),
    },
    'leaderboard.html': {
        'url': BASE + 'leaderboard.html',
        'title': None,  # Keep the user's requested browser-tab title: TTWL.
        'description': ('TTWL player leaderboard. Compare the hardest wallhops completed '
                        'by each player, total completions, and cleared wallhop lists.'),
    },
    'rules.html': {
        'url': BASE + 'rules.html',
        'title': None,  # Preserve the existing Rules browser tab title.
        'description': ('The Top Wallhops List (TTWL) rules for verifying and submitting '
                        'PC and Mobile wallhops, completions, and ranking eligibility.'),
    },
}
START = '<!-- TTWL SEO begin -->'
END = '<!-- TTWL SEO end -->'

# Remove only metadata we intentionally replace, keeping the owner's existing
# styles, scripts, favicon, images, and Search Console verification tags.
def strip_conflicts(source: str) -> str:
    for attr, values in (
        ('name', ('description', 'robots')),
        ('property', ('og:title', 'og:description', 'og:url', 'og:site_name', 'og:type')),
    ):
        for name in values:
            pattern = (r'<meta\b(?=[^>]*\b' + re.escape(attr) +
                       r'\s*=\s*["\']' + re.escape(name) + r'["\'])[^>]*>\s*')
            source = re.sub(pattern, '', source, flags=re.I)
    source = re.sub(
        r'<link\b(?=[^>]*\brel\s*=\s*["\']canonical["\'])[^>]*>\s*',
        '', source, flags=re.I,
    )
    return source


def page_meta(item: dict, *, homepage: bool) -> str:
    desc = html.escape(item['description'], quote=True)
    url = html.escape(item['url'], quote=True)
    site_name = html.escape('The Top Wallhops', quote=True)
    og_title = html.escape(item['title'] or ('TTWL — ' + ('Leaderboard' if item['url'].endswith('leaderboard.html') else 'Rules')), quote=True)
    lines = [
        START,
        '<meta name="robots" content="index, follow">',
        f'<meta name="description" content="{desc}">',
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{site_name}">',
        f'<meta property="og:title" content="{og_title}">',
        f'<meta property="og:description" content="{desc}">',
        f'<meta property="og:url" content="{url}">',
    ]
    if homepage:
        structured = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            'name': 'The Top Wallhops',
            'alternateName': ['TTWL', 'The Top Wallhops List', 'The Top Wallhop List'],
            'url': BASE,
            'description': item['description'],
        }
        lines.extend((
            '<script type="application/ld+json">',
            json.dumps(structured, ensure_ascii=False, separators=(',', ':')),
            '</script>',
        ))
    lines.append(END)
    return '\n'.join(lines)


def main() -> None:
    if not SITE.is_dir():
        raise SystemExit('ERROR: _site/ missing. Run this script after assembling the Pages site.')
    urls = []
    for filename, info in PAGES.items():
        path = SITE / filename
        if not path.is_file():
            if filename == 'index.html':
                raise SystemExit('ERROR: _site/index.html missing.')
            print(f'SKIP: optional page {filename} not found')
            continue
        doc = path.read_text(encoding='utf-8')
        doc = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\s*', '', doc, flags=re.S)
        if not re.search(r'</head\s*>', doc, flags=re.I):
            raise SystemExit(f'ERROR: {filename} has no closing </head>.')
        doc = strip_conflicts(doc)
        if info['title'] is not None:
            target_title = '<title>' + html.escape(info['title']) + '</title>'
            if re.search(r'<title\b[^>]*>.*?</title\s*>', doc, flags=re.I | re.S):
                doc = re.sub(r'<title\b[^>]*>.*?</title\s*>', target_title, doc, count=1, flags=re.I | re.S)
            else:
                doc = re.sub(r'</head\s*>', target_title + '\n</head>', doc, count=1, flags=re.I)
        doc = re.sub(r'</head\s*>', page_meta(info, homepage=filename=='index.html') + '\n</head>', doc, count=1, flags=re.I)
        path.write_text(doc, encoding='utf-8')
        urls.append(info['url'])
        print(f'SEO added: {path}')

    ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    root = ET.Element('{http://www.sitemaps.org/schemas/sitemap/0.9}urlset')
    for url in urls:
        e = ET.SubElement(root, '{http://www.sitemaps.org/schemas/sitemap/0.9}url')
        ET.SubElement(e, '{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text = url
    ET.ElementTree(root).write(SITE / 'sitemap.xml', encoding='utf-8', xml_declaration=True)
    print(f'Created {SITE / "sitemap.xml"} with {len(urls)} URLs.')
    print('Search Console verification must be completed by the site owner.')


if __name__ == '__main__':
    main()
