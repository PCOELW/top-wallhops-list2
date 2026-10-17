#!/usr/bin/env python3
"""Compare latest fetched rankings with last committed rankings.

New deployment data is always fresh; saved snapshot/history are updated only on actual
changes so the repository doesn't get one commit every 5 minutes.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path


def read_json(path, fallback):
    try:
        return json.loads(Path(path).read_text(encoding='utf8'))
    except (FileNotFoundError, ValueError):
        return fallback


def compare(old_items, new_items, platform, now):
    before = {str(r.get('title', '')).strip().casefold(): r for r in old_items if r.get('title')}
    after = {str(r.get('title', '')).strip().casefold(): r for r in new_items if r.get('title')}
    changes = []
    for key, item in after.items():
        prev = before.get(key)
        if prev is None:
            changes.append(dict(platform=platform, type='new', title=item['title'], rank=item.get('rank'), at=now))
            continue
        try:
            prev_rank, rank = int(prev.get('rank')), int(item.get('rank'))
        except (TypeError, ValueError):
            continue
        if rank != prev_rank:
            changes.append(dict(platform=platform, type='up' if rank < prev_rank else 'down',
                                title=item['title'], beforeRank=prev_rank, rank=rank, at=now))
    for key, old_item in before.items():
        if key not in after:
            changes.append(dict(platform=platform, type='removed', title=old_item['title'],
                                beforeRank=old_item.get('rank'), rank=None, at=now))
    return changes


def essential_rows(rows):
    # Roblox thumbnail URLs are best-effort and must not trigger commits.
    return [{key: value for key, value in row.items() if key != 'thumbnailUrl'} for row in rows]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh', default='.build/rankings.json')
    parser.add_argument('--snapshot', default='data/rankings.json')
    parser.add_argument('--history', default='data/changes.json')
    args = parser.parse_args()
    new = read_json(args.fresh, {})
    if new.get('status') != 'live':
        raise RuntimeError('Fresh rankings are not live. Refusing to update snapshot or changes.')
    old = read_json(args.snapshot, {})
    history = read_json(args.history, {'events': [], 'updatedAt': None})
    changed = old.get('status') != 'live' or any(
        essential_rows(old.get(platform, [])) != essential_rows(new.get(platform, [])) for platform in ('pc', 'mobile')
    )
    if not changed:
        print('No changes. Skipping snapshot commit.')
        return
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    events = []
    if old.get('status') == 'live':
        for platform in ('pc', 'mobile'):
            events.extend(compare(old.get(platform, []), new.get(platform, []), platform, now))
    # Keep the historical events for unchanged fields from older deployments.
    events = (events + history.get('events', []))[:50]
    new_history = {'events': events, 'updatedAt': now}
    Path(args.snapshot).parent.mkdir(parents=True, exist_ok=True)
    Path(args.snapshot).write_text(json.dumps(new, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    Path(args.history).write_text(json.dumps(new_history, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'Updated snapshot; {len(events)} stored change events.')


if __name__ == '__main__':
    main()
