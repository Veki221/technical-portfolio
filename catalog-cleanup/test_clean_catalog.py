import csv
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


class CatalogCleanupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workspace = tempfile.TemporaryDirectory()
        cls.addClassCleanup(workspace.cleanup)
        output = Path(workspace.name)
        shutil.copyfile(HERE / "source.csv", output / "source.csv")
        cls.command_result = subprocess.run(
            [sys.executable, str(HERE / "clean_catalog.py"), "source.csv"],
            cwd=output, capture_output=True, text=True, encoding="utf-8",
        )
        if cls.command_result.returncode == 0:
            with (output / "catalog.csv").open(encoding="utf-8-sig", newline="") as file:
                cls.catalog = list(csv.DictReader(file, delimiter=";"))
            with (output / "review.csv").open(encoding="utf-8-sig", newline="") as file:
                cls.review = list(csv.DictReader(file, delimiter=";"))

    def test_same_price_duplicates_are_merged(self):
        self.assertEqual(self.command_result.returncode, 0, self.command_result.stderr)
        self.assertEqual(
            [(row["sku"], row["price"]) for row in self.catalog],
            [("A-101", "1290.00"), ("F-620", "890.50"), ("G-730", "490.00")],
        )
        self.assertIn("duplicates=2", self.command_result.stdout)

    def test_invalid_prices_and_missing_fields_are_reported(self):
        self.assertEqual(self.command_result.returncode, 0, self.command_result.stderr)
        issues = {row["record"]: row for row in self.review}
        self.assertEqual(issues["6"]["price_raw"], "по запросу")
        self.assertEqual(issues["9"]["price_raw"], "0")
        for number in ("6", "9"):
            self.assertIn("invalid_price", issues[number]["issue"])
        self.assertIn("missing_name", issues["7"]["issue"])
        self.assertIn("missing_sku", issues["8"]["issue"])

    def test_all_conflicting_prices_are_reported(self):
        self.assertEqual(self.command_result.returncode, 0, self.command_result.stderr)
        self.assertNotIn("B-205", [row["sku"] for row in self.catalog])
        conflict = [row for row in self.review if row["sku"] == "B-205"]
        self.assertEqual([row["record"] for row in conflict], ["4", "5"])
        self.assertEqual([row["price_raw"] for row in conflict], ["2 490,00", "2590.00"])
        for row in conflict:
            self.assertEqual(row["issue"], "price_conflict")
            self.assertEqual(row["prices_found"], "2490.00 | 2590.00")

    def test_summary_accounts_for_all_records(self):
        self.assertEqual(self.command_result.returncode, 0, self.command_result.stderr)
        self.assertEqual(len(self.catalog), 3)
        self.assertEqual(len(self.review), 6)
        self.assertEqual(self.command_result.stdout.strip(), "processed=11 catalog=3 review=6 duplicates=2")


if __name__ == "__main__":
    unittest.main()
