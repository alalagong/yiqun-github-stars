import unittest

from scripts.classification import apply_override, classify


class ClassificationTests(unittest.TestCase):
    def test_ai_repository_gets_domain_and_review_metadata(self):
        row = {
            "owner": "openai",
            "repo": "whisper",
            "name": "openai / whisper",
            "description": "Robust speech recognition via deep learning.",
            "language": "Python",
        }

        result = classify(row)

        self.assertEqual(result["primary_domain"], "人工智能与机器学习")
        self.assertIn("代码项目", result["purpose_tags"])
        self.assertIn("简介", result["classification_basis"])

    def test_override_wins_without_dropping_unrelated_fields(self):
        row = classify({
            "owner": "example",
            "repo": "robot",
            "name": "example / robot",
            "description": "A robot control toolkit.",
            "language": "C++",
        })

        result = apply_override(row, {
            "primary_domain": "自定义领域",
            "purpose_tags": "实践项目",
            "confidence": "高",
        })

        self.assertEqual(result["primary_domain"], "自定义领域")
        self.assertEqual(result["purpose_tags"], "实践项目")
        self.assertEqual(result["confidence"], "高")
        self.assertTrue(result["tags"])


if __name__ == "__main__":
    unittest.main()

