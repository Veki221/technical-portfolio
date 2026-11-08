import argparse
import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path


FIELDS = ("sku", "name", "price")
REVIEW_FIELDS = ("record", "sku", "sku_raw", "name_raw", "price_raw", "issue",
                 "prices_found", "extra_fields")
PRICE = re.compile(r"([0-9]+|[0-9]{1,3}(?: [0-9]{3})+)(?:[.,]([0-9]{1,2}))?")


def normalize_price(raw):
    value = raw.replace("\u00a0", " ").replace("\u202f", " ").strip()
    match = PRICE.fullmatch(value.removesuffix("₽").rstrip())
    if match is None:
        return None
    whole, fraction = match.groups()
    whole = whole.replace(" ", "").lstrip("0") or "0"
    fraction = (fraction or "").ljust(2, "0")
    if whole == "0" and fraction == "00":
        return None
    return f"{whole}.{fraction}"


@dataclass
class Record:
    number: int
    fields: list[str]

    def __post_init__(self):
        self.sku_raw, self.name_raw, self.price_raw = (self.fields + [""] * 3)[:3]
        self.sku = self.sku_raw.strip().upper()
        self.name = self.name_raw.strip()
        self.price = normalize_price(self.price_raw)
        self.issues = []
        if len(self.fields) != len(FIELDS):
            self.issues.append("invalid_field_count")
        if not self.sku:
            self.issues.append("missing_sku")
        if not self.name:
            self.issues.append("missing_name")
        if self.price is None:
            self.issues.append("invalid_price")

    def review_row(self, prices):
        return (
            self.number, self.sku, self.sku_raw, self.name_raw, self.price_raw,
            " | ".join(self.issues), " | ".join(prices),
            json.dumps(self.fields[3:], ensure_ascii=False) if self.fields[3:] else "",
        )


def read_records(source):
    with source.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file, delimiter=";", strict=True)
        if next(reader, None) != list(FIELDS):
            raise ValueError("Expected the CSV header sku;name;price")
        return [Record(number, row) for number, row in enumerate(reader, start=2)]


def split_records(records):
    prices_by_sku = defaultdict(set)
    for row in records:
        if row.sku and row.price is not None:
            prices_by_sku[row.sku].add(row.price)
    conflicts = {
        sku: sorted(prices, key=Decimal)
        for sku, prices in prices_by_sku.items()
        if len(prices) > 1
    }

    catalog = {}
    review = []
    duplicates = 0
    for row in records:
        prices = conflicts.get(row.sku, [])
        if prices:
            row.issues.append("price_conflict")
        if row.issues:
            review.append(row.review_row(prices))
        elif row.sku in catalog:
            duplicates += 1
        else:
            catalog[row.sku] = (row.sku, row.name, row.price)
    return list(catalog.values()), review, duplicates


def write_csv(path, header, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file, delimiter=";")
        writer.writerow(header)
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Normalize a semicolon-delimited product CSV.")
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    catalog_path = source.with_name("catalog.csv")
    review_path = source.with_name("review.csv")
    if source in (catalog_path.resolve(), review_path.resolve()):
        parser.error("The source must not be one of the output files.")

    try:
        records = read_records(source)
        catalog, review, duplicates = split_records(records)
        write_csv(catalog_path, FIELDS, catalog)
        write_csv(review_path, REVIEW_FIELDS, review)
    except (OSError, UnicodeError, ValueError, csv.Error) as error:
        parser.exit(1, f"{error}\n")

    print(f"processed={len(records)} catalog={len(catalog)} review={len(review)} duplicates={duplicates}")


if __name__ == "__main__":
    main()
