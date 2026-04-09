#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import http.cookiejar
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import requests


BASE_URL = "https://pares.mcu.es/MovimientosMigratorios/"
LIST_URL = BASE_URL + "buscadorRaw.form?d-3602157-p={page}&objectsPerPage=25"
DETAIL_URL = BASE_URL + "detalle.form?nid={nid}"
DEFAULT_OUT_DIR = "data"
DEFAULT_COOKIE_JAR = "pares_cookies.txt"
DEFAULT_DELAY = 5.0
DEFAULT_FIRST_PAGE = 1
DEFAULT_LAST_PAGE = 3124


def now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def normalize_space(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    temp.replace(path)


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


class RequestsClient:
    def __init__(self, cookie_jar: Path, delay: float, max_retries: int = 4, timeout: int = 60):
        self.cookie_jar = cookie_jar
        self.delay = delay
        self.max_retries = max_retries
        self.timeout = timeout
        self.cookie_jar.parent.mkdir(parents=True, exist_ok=True)
        self.cookie_jar.touch(exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                )
            }
        )
        self.session.cookies = http.cookiejar.MozillaCookieJar(str(self.cookie_jar))
        try:
            self.session.cookies.load(ignore_discard=True, ignore_expires=True)
        except Exception:
            pass

    def get_text(self, url: str) -> str:
        last_error: str | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.get(url, timeout=(30, self.timeout), allow_redirects=True)
                response.raise_for_status()
                response.encoding = "iso-8859-1"
                text = response.text
                self.session.cookies.save(ignore_discard=True, ignore_expires=True)
                try:
                    return text
                finally:
                    time.sleep(self.delay)
            except requests.RequestException as exc:
                last_error = str(exc)
            backoff = self.delay * attempt
            print(f"[warn] fetch failed (attempt {attempt}/{self.max_retries}): {url} :: {last_error}", file=sys.stderr)
            time.sleep(backoff)

        raise RuntimeError(f"failed to fetch {url}: {last_error}")


class JsonStore:
    def __init__(self, out_dir: Path):
        self.out_dir = out_dir
        self.pages_path = out_dir / "pages.json"
        self.ids_path = out_dir / "ids.json"
        self.details_path = out_dir / "details.jsonl"
        self.failures_path = out_dir / "detail_failures.json"

    def load_pages(self) -> dict[str, Any]:
        return load_json(self.pages_path, {})

    def save_pages(self, pages: dict[str, Any]) -> None:
        save_json_atomic(self.pages_path, pages)

    def load_ids(self) -> dict[str, Any]:
        return load_json(self.ids_path, {})

    def save_ids(self, ids_map: dict[str, Any]) -> None:
        save_json_atomic(self.ids_path, ids_map)

    def load_failures(self) -> dict[str, Any]:
        return load_json(self.failures_path, {})

    def save_failures(self, failures: dict[str, Any]) -> None:
        save_json_atomic(self.failures_path, failures)

    def append_detail(self, record: dict[str, Any]) -> None:
        append_jsonl(self.details_path, record)

    def load_fetched_nids(self) -> set[int]:
        fetched: set[int] = set()
        for record in iter_jsonl(self.details_path):
            nid = record.get("nid")
            if nid is not None:
                fetched.add(int(nid))
        return fetched

    def iter_detail_records(self) -> Iterable[dict[str, Any]]:
        yield from iter_jsonl(self.details_path)


def parse_listing_ids(html_text: str) -> list[int]:
    ids = re.findall(r"detalle\.form\?nid=(\d+)", html_text, flags=re.IGNORECASE)
    seen: set[int] = set()
    ordered: list[int] = []
    for nid_raw in ids:
        nid = int(nid_raw)
        if nid not in seen:
            seen.add(nid)
            ordered.append(nid)
    return ordered


def extract_record_title(html_text: str) -> str | None:
    match = re.search(r"<h3>\s*(.*?)\s*</h3>", html_text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return normalize_space(match.group(1))


def extract_birth_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\b(\d{4})\b", value)
    if not match:
        return None
    return int(match.group(1))


def parse_detail(html_text: str, listing_meta: dict[str, Any]) -> dict[str, Any]:
    nid = int(listing_meta["nid"])
    page_num = int(listing_meta["page_num"])
    data: dict[str, Any] = {
        "nid": nid,
        "detail_url": DETAIL_URL.format(nid=nid),
        "page_num": page_num,
        "source_page_url": LIST_URL.format(page=page_num),
        "fetched_at": now_iso(),
    }
    title = extract_record_title(html_text)
    if title:
        data["record_title"] = title

    fields: dict[str, str] = {}
    for match in re.finditer(
        r"<tr[^>]*>\s*<th[^>]*>\s*(.*?)\s*</th>\s*<td[^>]*>\s*(.*?)\s*</td>\s*</tr>",
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        raw_key, raw_value = match.groups()
        key = normalize_space(raw_key)
        value = normalize_space(raw_value)
        if key and value:
            fields[key] = value

    data["fields"] = fields
    data["full_name"] = fields.get("Apellidos y nombre")
    data["birth_year"] = extract_birth_year(fields.get("Fecha de nacimiento"))
    return data


def fetch_list_pages(client: RequestsClient, store: JsonStore, first_page: int, last_page: int, force: bool) -> None:
    pages = store.load_pages()
    ids_map = store.load_ids()

    for page in range(first_page, last_page + 1):
        page_key = str(page)
        if not force and pages.get(page_key, {}).get("status") == "ok":
            continue

        url = LIST_URL.format(page=page)
        print(f"[list] page {page}/{last_page}")
        try:
            html_text = client.get_text(url)
            ids = parse_listing_ids(html_text)
            fetched_at = now_iso()
            pages[page_key] = {
                "page_num": page,
                "fetched_at": fetched_at,
                "item_count": len(ids),
                "status": "ok",
                "error": None,
            }
            for nid in ids:
                ids_map[str(nid)] = {
                    "nid": nid,
                    "page_num": page,
                    "detail_url": DETAIL_URL.format(nid=nid),
                    "discovered_at": fetched_at,
                }
            store.save_pages(pages)
            store.save_ids(ids_map)
        except Exception as exc:  # noqa: BLE001
            pages[page_key] = {
                "page_num": page,
                "fetched_at": now_iso(),
                "item_count": None,
                "status": "error",
                "error": str(exc),
            }
            store.save_pages(pages)
            print(f"[error] list page {page}: {exc}", file=sys.stderr)


def fetch_details(client: RequestsClient, store: JsonStore, limit: int | None, retry_failures: bool) -> None:
    ids_map = store.load_ids()
    fetched_nids = store.load_fetched_nids()
    failures = {} if retry_failures else store.load_failures()

    pending = [record for _, record in sorted(ids_map.items(), key=lambda item: (item[1]["page_num"], item[1]["nid"])) if int(record["nid"]) not in fetched_nids]
    if limit is not None:
        pending = pending[:limit]

    total = len(pending)
    for index, record in enumerate(pending, start=1):
        nid = int(record["nid"])
        url = str(record["detail_url"])
        print(f"[detail] {index}/{total} nid={nid}")
        try:
            html_text = client.get_text(url)
            parsed = parse_detail(html_text, record)
            store.append_detail(parsed)
            fetched_nids.add(nid)
            failures.pop(str(nid), None)
            store.save_failures(failures)
        except Exception as exc:  # noqa: BLE001
            failures[str(nid)] = {
                "nid": nid,
                "detail_url": url,
                "failed_at": now_iso(),
                "last_error": str(exc),
            }
            store.save_failures(failures)
            print(f"[error] detail nid={nid}: {exc}", file=sys.stderr)


def export_csv(store: JsonStore, output_path: Path) -> None:
    records = list(store.iter_detail_records())
    if not records:
        raise RuntimeError("no scraped detail records found")

    fieldnames: list[str] = ["nid", "detail_url", "page_num", "source_page_url", "record_title", "full_name", "birth_year", "fetched_at"]
    seen = set(fieldnames)
    for record in records:
        for key in record.get("fields", {}):
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            row = {
                "nid": record.get("nid"),
                "detail_url": record.get("detail_url"),
                "page_num": record.get("page_num"),
                "source_page_url": record.get("source_page_url"),
                "record_title": record.get("record_title"),
                "full_name": record.get("full_name"),
                "birth_year": record.get("birth_year"),
                "fetched_at": record.get("fetched_at"),
            }
            row.update(record.get("fields", {}))
            writer.writerow(row)


def flatten_record(record: dict[str, Any]) -> dict[str, Any]:
    row = {
        "nid": record.get("nid"),
        "detail_url": record.get("detail_url"),
        "page_num": record.get("page_num"),
        "source_page_url": record.get("source_page_url"),
        "record_title": record.get("record_title"),
        "full_name": record.get("full_name"),
        "birth_year": record.get("birth_year"),
        "fetched_at": record.get("fetched_at"),
    }
    row.update(record.get("fields", {}))
    return row


def export_flat_json(store: JsonStore, output_path: Path) -> None:
    records = [flatten_record(record) for record in store.iter_detail_records()]
    if not records:
        raise RuntimeError("no scraped detail records found")
    save_json_atomic(output_path, records)


def print_status(store: JsonStore) -> None:
    pages = store.load_pages()
    ids_map = store.load_ids()
    failures = store.load_failures()
    fetched_nids = store.load_fetched_nids()

    pages_ok = sum(1 for page in pages.values() if page.get("status") == "ok")
    pages_error = sum(1 for page in pages.values() if page.get("status") == "error")

    print(f"pages_ok={pages_ok}")
    print(f"pages_error={pages_error}")
    print(f"listing_ids={len(ids_map)}")
    print(f"details_ok={len(fetched_nids)}")
    print(f"details_error={len(failures)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scraper HTML para PARES Movimientos Migratorios usando requests.")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help=f"Directorio de salida. Default: {DEFAULT_OUT_DIR}")
    parser.add_argument(
        "--cookie-jar",
        default=DEFAULT_COOKIE_JAR,
        help=f"Ruta al cookie jar de cookies. Default: {DEFAULT_COOKIE_JAR}",
    )
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help=f"Pausa entre requests. Default: {DEFAULT_DELAY}s")

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("fetch-list", help="Recorre las páginas del listado y guarda los nid.")
    list_parser.add_argument("--first-page", type=int, default=DEFAULT_FIRST_PAGE)
    list_parser.add_argument("--last-page", type=int, default=DEFAULT_LAST_PAGE)
    list_parser.add_argument("--force", action="store_true", help="Vuelve a bajar páginas ya exitosas.")
    list_parser.add_argument("--delay", type=float, default=None, help="Sobrescribe la pausa global entre requests.")

    detail_parser = subparsers.add_parser("fetch-details", help="Baja y parsea las fichas detalle pendientes.")
    detail_parser.add_argument("--limit", type=int, default=None, help="Cantidad máxima de detalles a procesar.")
    detail_parser.add_argument("--retry-failures", action="store_true", help="Limpia fallos previos y reintenta.")
    detail_parser.add_argument("--delay", type=float, default=None, help="Sobrescribe la pausa global entre requests.")

    subparsers.add_parser("status", help="Muestra el estado del scraping.")

    export_parser = subparsers.add_parser("export-csv", help="Exporta los detalles parseados a CSV.")
    export_parser.add_argument("--output", default="pares_migratorios.csv", help="Ruta del CSV de salida.")

    export_json_parser = subparsers.add_parser("export-json", help="Exporta los detalles parseados a un JSON plano.")
    export_json_parser.add_argument("--output", default="data/records.json", help="Ruta del JSON de salida.")

    all_parser = subparsers.add_parser("run-all", help="Hace listado y luego detalle.")
    all_parser.add_argument("--first-page", type=int, default=DEFAULT_FIRST_PAGE)
    all_parser.add_argument("--last-page", type=int, default=DEFAULT_LAST_PAGE)
    all_parser.add_argument("--limit", type=int, default=None)
    all_parser.add_argument("--force", action="store_true")
    all_parser.add_argument("--retry-failures", action="store_true")
    all_parser.add_argument("--delay", type=float, default=None, help="Sobrescribe la pausa global entre requests.")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    cookie_jar = Path(args.cookie_jar).resolve()
    store = JsonStore(out_dir)
    delay = args.delay
    if getattr(args, "delay", None) is not None:
        delay = args.delay
    client = RequestsClient(cookie_jar=cookie_jar, delay=delay)

    if args.command == "fetch-list":
        fetch_list_pages(client, store, args.first_page, args.last_page, args.force)
        return 0

    if args.command == "fetch-details":
        fetch_details(client, store, args.limit, args.retry_failures)
        return 0

    if args.command == "status":
        print_status(store)
        return 0

    if args.command == "export-csv":
        export_csv(store, Path(args.output).resolve())
        return 0

    if args.command == "export-json":
        export_flat_json(store, Path(args.output).resolve())
        return 0

    if args.command == "run-all":
        fetch_list_pages(client, store, args.first_page, args.last_page, args.force)
        fetch_details(client, store, args.limit, args.retry_failures)
        return 0

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
