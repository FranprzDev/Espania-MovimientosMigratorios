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

export async function searchDataset(query: string, birthYear?: number, limit = 120): Promise<MigrantRecord[]> {
  const records = await loadDataset();
  const normalizedQuery = normalize(query);

  return records
    .filter((record) => {
      const matchesYear = birthYear ? Number(record.birth_year) === birthYear : true;
      if (!matchesYear) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystacks = [record.full_name, record.record_title, record["Apellidos y nombre"]]
        .filter(Boolean)
        .map((value) => normalize(String(value)));
      return haystacks.some((value) => value.includes(normalizedQuery));
    })
    .sort((a, b) => {
      const pageDiff = Number(a.page_num ?? 0) - Number(b.page_num ?? 0);
      if (pageDiff !== 0) {
        return pageDiff;
      }
      return Number(a.nid ?? 0) - Number(b.nid ?? 0);
    })
    .slice(0, limit);
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
