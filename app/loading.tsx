const rows = Array.from({ length: 7 }, (_, index) => index);

export default function Loading() {
  return (
    <main className="page-shell simple-shell">
      <section className="toolbar loading-surface" aria-live="polite" aria-busy="true">
        <div className="toolbar-copy">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-subtitle" />
        </div>
        <div className="loading-badge">
          <div className="loading-spinner" />
          <strong>Buscando resultados</strong>
        </div>
      </section>

      <section className="search-box loading-surface">
        <div className="filters-grid loading-grid">
          <div className="field">
            <span>Nombre</span>
            <div className="skeleton skeleton-input" />
          </div>
          <div className="field">
            <span>Anio</span>
            <div className="skeleton skeleton-input" />
          </div>
          <div className="field">
            <span>Pais</span>
            <div className="skeleton skeleton-input" />
          </div>
          <div className="field">
            <span>Lugar</span>
            <div className="skeleton skeleton-input" />
          </div>
          <div className="actions">
            <div className="skeleton skeleton-button" />
          </div>
        </div>
      </section>

      <section className="results-box loading-surface">
        <div className="results-top">
          <div className="skeleton skeleton-metric" />
          <div className="skeleton skeleton-page" />
        </div>

        <div className="table-wrap">
          <table className="results-table loading-table">
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
              {rows.map((row) => (
                <tr key={row}>
                  <td><div className="skeleton skeleton-name" /></td>
                  <td><div className="skeleton skeleton-cell short" /></td>
                  <td><div className="skeleton skeleton-cell medium" /></td>
                  <td><div className="skeleton skeleton-cell short" /></td>
                  <td><div className="skeleton skeleton-cell medium" /></td>
                  <td><div className="skeleton skeleton-cell medium" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
