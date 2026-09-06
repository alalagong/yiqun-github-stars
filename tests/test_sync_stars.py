import json
import unittest
from unittest.mock import Mock

from scripts.sync_stars import (
    build_sync_result,
    fetch_starred_repositories,
    normalize_repository,
    parse_next_link,
)


class SyncStarsTests(unittest.TestCase):
    def test_parse_next_link_reads_github_link_header(self):
        header = '<https://api.github.com/users/alalagong/starred?page=2>; rel="next", <https://api.github.com/users/alalagong/starred?page=4>; rel="last"'
        self.assertEqual(parse_next_link(header), "https://api.github.com/users/alalagong/starred?page=2")
        self.assertIsNone(parse_next_link('<https://example.com>; rel="last"'))

    def test_fetch_merges_pages_and_stops_without_next_link(self):
        first = Mock()
        first.read.return_value = json.dumps([{"id": 1}]).encode()
        first.headers.get.return_value = '<https://api.github.com/users/alalagong/starred?page=2>; rel="next"'
        second = Mock()
        second.read.return_value = json.dumps([{"id": 2}]).encode()
        second.headers.get.return_value = ""
        opener = Mock(side_effect=[first, second])

        rows = fetch_starred_repositories("alalagong", opener=opener)

        self.assertEqual(rows, [{"id": 1}, {"id": 2}])
        self.assertEqual(opener.call_count, 2)

    def test_normalize_repository_uses_stable_owner_repo_fields(self):
        payload = {
            "owner": {"login": "octo"},
            "name": "demo",
            "html_url": "https://github.com/octo/demo",
            "description": "Example",
            "language": "Python",
            "stargazers_count": 123,
            "forks_count": 4,
            "updated_at": "2026-09-01T00:00:00Z",
        }

        row = normalize_repository(payload, 7)

        self.assertEqual(row["owner"], "octo")
        self.assertEqual(row["repo"], "demo")
        self.assertEqual(row["name"], "octo / demo")
        self.assertEqual(row["index"], 7)
        self.assertEqual(row["stars"], 123)
        self.assertEqual(row["activity"], "近一年更新")
        self.assertEqual(row["popularity"], "100+")

    def test_build_sync_result_detects_added_removed_changed_and_unchanged(self):
        previous = [
            {"owner": "a", "repo": "same", "stars": 1},
            {"owner": "a", "repo": "changed", "stars": 1},
            {"owner": "a", "repo": "removed", "stars": 1},
        ]
        current = [
            {"owner": "a", "repo": "same", "stars": 1},
            {"owner": "a", "repo": "changed", "stars": 2},
            {"owner": "a", "repo": "added", "stars": 1},
        ]

        result = build_sync_result(previous, current, "2026-09-06T00:00:00Z")

        self.assertEqual(result["change_summary"], {"added": 1, "removed": 1, "changed": 1, "unchanged": 1})
        self.assertEqual(result["collected_at"], "2026-09-06T00:00:00Z")


if __name__ == "__main__":
    unittest.main()

