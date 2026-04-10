import { readFile } from "node:fs/promises";
import path from "node:path";

export type MigrantRecord = {
  nid: number;
  detail_url?: string;
  page_num?: number;
  source_page_url?: string;
  record_title?: string;
  full_name?: string;
  birth_year?: number | null;
  fetched_at?: string;
  [key: string]: string | number | null | undefined;
};

export type SearchFilters = {
  query?: string;
  birthYear?: number;
  country?: string;
  place?: string;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  total: number;
  records: MigrantRecord[];
};

const datasetPath = path.join(process.cwd(), "data", "details.jsonl");

let cachedDataset: MigrantRecord[] | null = null;
let cachedMtimeMs = 0;

async function loadDatasetFromDisk(): Promise<MigrantRecord[]> {
  const fs = await import("node:fs/promises");
  const stat = await fs.stat(datasetPath);
  if (cachedDataset && stat.mtimeMs === cachedMtimeMs) {
    return cachedDataset;
  }

  const raw = await readFile(datasetPath, "utf8");
  const records = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { fields?: Record<string, string> } & MigrantRecord)
    .map((record) => ({ ...record.fields, ...record }));

  cachedDataset = records;
  cachedMtimeMs = stat.mtimeMs;
  return records;
}

export async function loadDataset(): Promise<MigrantRecord[]> {
  try {
    return await loadDatasetFromDisk();
  } catch {
    return [];
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function collectFieldValues(record: MigrantRecord, keys: string[]): string[] {
  return keys
    .map((key) => record[key])
    .filter((value): value is string | number => value !== undefined && value !== null && String(value).trim().length > 0)
    .map((value) => normalize(String(value)));
}

export async function searchDataset({
  query = "",
  birthYear,
  country = "",
  place = "",
  limit = 120,
  offset = 0,
}: SearchFilters): Promise<SearchResult> {
  const records = await loadDataset();
  const queryTokens = tokenize(query);
  const countryTokens = tokenize(country);
  const placeTokens = tokenize(place);

  const filtered = records
    .filter((record) => {
      const matchesYear = birthYear ? Number(record.birth_year) === birthYear : true;
      if (!matchesYear) {
        return false;
      }

      const nameFields = [record.full_name, record.record_title, record["Apellidos y nombre"]]
        .filter(Boolean)
        .map((value) => normalize(String(value)));

      const countryFields = collectFieldValues(record, [
        "Nacionalidad",
        "Lugar de nacimiento",
        "Ultima residencia",
        "Lugar de entrada",
        "Lugar de salida",
        "Tipo lugar de entrada",
        "Tipo lugar de salida",
        "Fondo",
        "Productor",
        "Existencia y localización de los originales",
      ]);

      const placeFields = collectFieldValues(record, [
        "Lugar de nacimiento",
        "Ultima residencia",
        "Lugar de entrada",
        "Lugar de salida",
        "Lugar de embarque",
        "Lugar de desembarque",
        "Fondo",
        "Productor",
        "Existencia y localización de los originales",
        "Notas",
      ]);

      const allFields = Array.from(new Set([...nameFields, ...countryFields, ...placeFields]));

      const matchesQuery =
        queryTokens.length === 0 || queryTokens.every((token) => allFields.some((value) => value.includes(token)));
      if (!matchesQuery) {
        return false;
      }

      const matchesCountry =
        countryTokens.length === 0 || countryTokens.every((token) => countryFields.some((value) => value.includes(token)));
      if (!matchesCountry) {
        return false;
      }

      const matchesPlace =
        placeTokens.length === 0 || placeTokens.every((token) => placeFields.some((value) => value.includes(token)));
      return matchesPlace;
    })
    .sort((a, b) => {
      const pageDiff = Number(a.page_num ?? 0) - Number(b.page_num ?? 0);
      if (pageDiff !== 0) {
        return pageDiff;
      }
      return Number(a.nid ?? 0) - Number(b.nid ?? 0);
    });

  return {
    total: filtered.length,
    records: filtered.slice(offset, offset + limit),
  };
}

export async function getDatasetSummary() {
  const records = await loadDataset();
  const years = records
    .map((record) => Number(record.birth_year))
    .filter((value) => Number.isFinite(value));

  return {
    total: records.length,
    minBirthYear: years.length ? Math.min(...years) : null,
    maxBirthYear: years.length ? Math.max(...years) : null,
  };
}

export async function getCountryOptions(): Promise<string[]> {
  const records = await loadDataset();

  return Array.from(
    new Set(
      records
        .map((record) => String(record["Nacionalidad"] ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
}
