"""Fetch public GitHub Stars and maintain versioned JSON snapshots."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from .classification import apply_override, classify
except ImportError:  # Allows `python scripts/sync_stars.py` from the repo root.
    from classification import apply_override, classify


API_TEMPLATE = "https://api.github.com/users/{username}/starred?per_page=100&page=1"
USER_AGENT = "yiqun-github-stars-sync/1.0"
CLASSIFICATION_FIELDS = (
    "primary_domain",
    "secondary_domains",
    "purpose_tags",
    "tags",
    "confidence",
    "review_flag",
    "classification_basis",
)


def parse_next_link(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for match in re.finditer(r"<([^>]+)>;\s*rel=\"([^\"]+)\"", link_header):
        if match.group(2) == "next":
            return match.group(1)
    return None


def fetch_starred_repositories(username: str, token: str | None = None, opener=None) -> list[dict]:
    """Fetch all public starred repositories, following GitHub pagination."""

    open_fn = opener or (lambda request: urlopen(request, timeout=30))
    url = API_TEMPLATE.format(username=username)
    repositories = []
    page_count = 0
    while url:
        page_count += 1
        if page_count > 100:
            raise RuntimeError("GitHub pagination exceeded 100 pages")
        headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(url, headers=headers)
        try:
            response = open_fn(request)
            status = getattr(response, "status", 200)
            if not isinstance(status, int):
                status = 200
            if status >= 400:
                raise RuntimeError(f"GitHub API returned HTTP {status}")
            payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise RuntimeError(f"GitHub API returned HTTP {error.code}") from error
        except (URLError, TimeoutError) as error:
            raise RuntimeError(f"GitHub API request failed: {error}") from error
        except json.JSONDecodeError as error:
            raise RuntimeError("GitHub API returned invalid JSON") from error
        if not isinstance(payload, list):
            raise RuntimeError("GitHub API returned an unexpected payload")
        repositories.extend(payload)
        url = parse_next_link(response.headers.get("Link"))
    return repositories


def normalize_repository(payload: dict, index: int) -> dict:
    owner = (payload.get("owner") or {}).get("login") or "unknown"
    repo = payload.get("name") or "unknown"
    return {
        "index": index,
        "owner": owner,
        "repo": repo,
        "name": f"{owner} / {repo}",
        "url": payload.get("html_url") or f"https://github.com/{owner}/{repo}",
        "description": payload.get("description") or "",
        "language": payload.get("language") or "",
        "stars": int(payload.get("stargazers_count") or 0),
        "forks": int(payload.get("forks_count") or 0),
        "updated": payload.get("pushed_at") or payload.get("updated_at") or "",
    }


def _comparison_row(row: dict) -> dict:
    return {key: value for key, value in row.items() if key != "index"}


def build_sync_result(previous: list[dict], current: list[dict], collected_at: str) -> dict:
    previous_map = {f"{row.get('owner')}/{row.get('repo')}": row for row in previous}
    current_map = {f"{row.get('owner')}/{row.get('repo')}": row for row in current}
    added = current_map.keys() - previous_map.keys()
    removed = previous_map.keys() - current_map.keys()
    changed = {
        key for key in current_map.keys() & previous_map.keys()
        if _comparison_row(current_map[key]) != _comparison_row(previous_map[key])
    }
    unchanged = current_map.keys() & previous_map.keys() - changed
    return {
        "collected_at": collected_at,
        "row_count": len(current),
        "change_summary": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "unchanged": len(unchanged),
        },
    }


def _read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON: {path}") from error


def _atomic_write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def _validate_rows(rows: list[dict]) -> None:
    keys = [f"{row.get('owner')}/{row.get('repo')}" for row in rows]
    if len(keys) != len(set(keys)):
        raise RuntimeError("Duplicate owner/repo keys in sync result")
    for row in rows:
        if not row.get("owner") or not row.get("repo") or not row.get("url"):
            raise RuntimeError("Sync result contains a row without owner, repo, or url")


def sync(data_dir: Path, username: str, token: str | None = None, dry_run: bool = False) -> dict:
    data_path = data_dir / "stars.json"
    overrides_path = data_dir / "classification_overrides.json"
    history_dir = data_dir / "history"
    previous_payload = _read_json(data_path, {"summary": {}, "taxonomy": [], "rows": []})
    overrides = _read_json(overrides_path, {})
    if not isinstance(overrides, dict):
        raise RuntimeError("classification_overrides.json must contain an object")

    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    raw_repositories = fetch_starred_repositories(username, token=token)
    current_rows = []
    previous_map = {f"{row.get('owner')}/{row.get('repo')}": row for row in previous_payload.get("rows", [])}
    for index, payload in enumerate(raw_repositories, start=1):
        row = normalize_repository(payload, index)
        key = f"{row['owner']}/{row['repo']}"
        previous = previous_map.get(key)
        if previous:
            for field in CLASSIFICATION_FIELDS:
                if field in previous:
                    row[field] = previous[field]
        else:
            row = classify(row)
        current_rows.append(apply_override(row, overrides.get(key)))
    _validate_rows(current_rows)
    result = build_sync_result(previous_payload.get("rows", []), current_rows, collected_at)
    result["source"] = f"https://api.github.com/users/{username}/starred"
    result["username"] = username
    if dry_run:
        return result
    if result["change_summary"] == {"added": 0, "removed": 0, "changed": 0, "unchanged": len(current_rows)}:
        return result | {"written": False}

    summary = dict(previous_payload.get("summary") or {})
    summary.update({"profile_url": f"https://github.com/{username}?tab=stars", "collected_at": collected_at[:10], "collected_public_rows": len(current_rows)})
    payload = {"summary": summary, "taxonomy": previous_payload.get("taxonomy", []), "rows": current_rows}
    snapshot_name = f"stars-{collected_at.replace(':', '-')}"
    snapshot_path = history_dir / f"{snapshot_name}.json"
    manifest = {
        "source": result["source"],
        "username": username,
        "collected_at": collected_at,
        "row_count": len(current_rows),
        "snapshot_file": str(snapshot_path.relative_to(data_dir.parent)).replace("\\", "/"),
        "change_summary": result["change_summary"],
    }
    _atomic_write(data_path, payload)
    _atomic_write(snapshot_path, payload)
    _atomic_write(data_dir / "sync-manifest.json", manifest)
    return result | {"written": True, "snapshot_file": str(snapshot_path)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync public GitHub Stars into versioned JSON data")
    parser.add_argument("--username", default=os.environ.get("GITHUB_USERNAME", "alalagong"))
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--token-env", default="GITHUB_TOKEN")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    token = os.environ.get(args.token_env)
    try:
        result = sync(args.data_dir, args.username, token=token, dry_run=args.dry_run)
    except (OSError, RuntimeError) as error:
        print(f"sync failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

