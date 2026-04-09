import { getDatasetSummary, searchDataset } from "../lib/dataset";

type SearchParams = Promise<{
  q?: string;
  year?: string;
}>;

function parseYear(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const birthYear = parseYear(params.year);
  const summary = await getDatasetSummary();
  const results = await searchDataset(query, birthYear);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Archivo local consultable</p>
          <h1>Movimientos migratorios, listos para buscar sin golpear PARES en cada consulta.</h1>
          <p className="lead">
            El scraping queda del lado de Python. Next.js solo consulta el dataset local y preserva el orden original
            mediante la página fuente del listado.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span>Registros cargados</span>
            <strong>{summary.total.toLocaleString("es-AR")}</strong>
          </div>
          <div className="stat-card">
            <span>Rango nacimiento</span>
            <strong>
              {summary.minBirthYear ?? "?"} - {summary.maxBirthYear ?? "?"}
            </strong>
          </div>
        </div>
      </section>

      <section className="search-panel">
        <form className="search-form">
          <label className="field">
            <span>Nombre y apellido</span>
            <input
              defaultValue={query}
              name="q"
              placeholder="Ej. Rafael Blesa Noguera"
              autoComplete="off"
            />
          </label>

          <label className="field field-year">
            <span>Año de nacimiento</span>
            <input defaultValue={birthYear ?? ""} name="year" inputMode="numeric" placeholder="1890" />
          </label>

          <button type="submit">Buscar</button>
        </form>
      </section>

      <section className="results-panel">
        <div className="results-head">
          <div>
            <p className="eyebrow">Resultados</p>
            <h2>{results.length ? `${results.length} coincidencias visibles` : "Sin coincidencias aún"}</h2>
          </div>
          <p className="results-note">Se ordena por `page_num` y luego por `nid` para conservar el flujo del listado original.</p>
        </div>

        <div className="result-grid">
          {results.map((record) => (
            <article className="record-card" key={record.nid}>
              <div className="record-topline">
                <span className="record-chip">p={record.page_num ?? "-"}</span>
                <span className="record-chip">nid={record.nid}</span>
              </div>

              <h3>{record.full_name ?? record["Apellidos y nombre"] ?? "Sin nombre"}</h3>
              <p className="record-subtitle">{record.record_title ?? "Ficha sin título"}</p>

              <dl className="record-meta">
                <div>
                  <dt>Nacimiento</dt>
                  <dd>{String(record["Fecha de nacimiento"] ?? record.birth_year ?? "Sin dato")}</dd>
                </div>
                <div>
                  <dt>Lugar</dt>
                  <dd>{String(record["Lugar de nacimiento"] ?? "Sin dato")}</dd>
                </div>
                <div>
                  <dt>Nacionalidad</dt>
                  <dd>{String(record["Nacionalidad"] ?? "Sin dato")}</dd>
                </div>
                <div>
                  <dt>Profesión</dt>
                  <dd>{String(record["Profesiones"] ?? "Sin dato")}</dd>
                </div>
              </dl>

              <div className="record-actions">
                {record.source_page_url ? (
                  <a href={String(record.source_page_url)} target="_blank" rel="noreferrer">
                    Ir -&gt; listado fuente
                  </a>
                ) : null}
                {record.detail_url ? (
                  <a href={String(record.detail_url)} target="_blank" rel="noreferrer">
                    Ver ficha
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
