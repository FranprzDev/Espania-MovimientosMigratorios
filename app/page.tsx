import { getCountryOptions, getDatasetSummary, searchDataset } from "../lib/dataset";

type SearchParams = Promise<{
  q?: string;
  year?: string;
  country?: string;
  place?: string;
  page?: string;
}>;

const PAGE_SIZE = 100;

function parseYear(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

function parsePage(raw?: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }
  return value;
}

function buildQueryString(params: {
  q?: string;
  year?: number;
  country?: string;
  place?: string;
  page?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.year) search.set("year", String(params.year));
  if (params.country) search.set("country", params.country);
  if (params.place) search.set("place", params.place);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  return `/?${search.toString()}`;
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const country = (params.country ?? "").trim();
  const place = (params.place ?? "").trim();
  const birthYear = parseYear(params.year);
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const summary = await getDatasetSummary();
  const countries = await getCountryOptions();
  const { total, records } = await searchDataset({ query, birthYear, country, place, limit: PAGE_SIZE, offset });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const activeFilters = [query, country, place, birthYear ? String(birthYear) : ""].filter(Boolean).length;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);
  const prevHref = buildQueryString({ q: query, year: birthYear, country, place, page: Math.max(1, safePage - 1) });
  const nextHref = buildQueryString({ q: query, year: birthYear, country, place, page: safePage + 1 });

  return (
    <main className="page-shell simple-shell">
      <section className="toolbar">
        <div className="toolbar-copy">
          <h1>Buscador de movimientos migratorios</h1>
          <p>{summary.total.toLocaleString("es-AR")} registros</p>
        </div>
      </section>

      <section className="search-box">
        <form className="filters-grid" method="get">
          <label className="field">
            <span>Nombre</span>
            <input defaultValue={query} name="q" placeholder="juan caraballo duarte" autoComplete="off" />
          </label>

          <label className="field">
            <span>Anio</span>
            <input defaultValue={birthYear ?? ""} name="year" inputMode="numeric" placeholder="1890" />
          </label>

          <label className="field">
            <span>Pais</span>
            <select defaultValue={country} name="country">
              <option value="">Todos</option>
              {countries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Lugar</span>
            <input defaultValue={place} name="place" placeholder="Montevideo, Rosario..." autoComplete="off" />
          </label>

          <div className="actions">
            <button type="submit">Buscar</button>
            <a href="/">Limpiar</a>
          </div>
        </form>

        <div className="search-hints">
          <span>{activeFilters ? `${activeFilters} filtros activos` : "Sin filtros"}</span>
          <span>
            Mostrando {showingFrom.toLocaleString("es-AR")} - {showingTo.toLocaleString("es-AR")} de{" "}
            {total.toLocaleString("es-AR")} coincidencias.
          </span>
        </div>
      </section>

      <section className="results-box">
        <div className="results-top">
          <strong>{total.toLocaleString("es-AR")} coincidencias</strong>
          <span>Pagina {safePage} de {totalPages}</span>
        </div>

        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Nacimiento</th>
                <th>Lugar de nacimiento</th>
                <th>Nacionalidad</th>
                <th>Ultima residencia</th>
                <th>Entrada / salida</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    Sin coincidencias para los filtros actuales.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.nid}>
                    <td>
                      <div className="name-cell">
                        {record.detail_url ? (
                          <a href={String(record.detail_url)} target="_blank" rel="noreferrer" className="name-link">
                            <strong>{record.full_name ?? record["Apellidos y nombre"] ?? "Sin nombre"}</strong>
                          </a>
                        ) : (
                          <strong>{record.full_name ?? record["Apellidos y nombre"] ?? "Sin nombre"}</strong>
                        )}
                      </div>
                    </td>
                    <td>{String(record["Fecha de nacimiento"] ?? record.birth_year ?? "Sin dato")}</td>
                    <td>{String(record["Lugar de nacimiento"] ?? "Sin dato")}</td>
                    <td>{String(record["Nacionalidad"] ?? "Sin dato")}</td>
                    <td>{String(record["Ultima residencia"] ?? "Sin dato")}</td>
                    <td>{String(record["Lugar de entrada"] ?? record["Lugar de salida"] ?? "Sin dato")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <a href={prevHref} aria-disabled={safePage <= 1}>
            Anterior
          </a>
          <span>Pagina {safePage} / {totalPages}</span>
          <a href={nextHref} aria-disabled={safePage >= totalPages}>
            Siguiente
          </a>
        </div>
      </section>
    </main>
  );
}
