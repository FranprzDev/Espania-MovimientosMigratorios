# Espana Movimientos Migratorios

Proyecto para extraer, estructurar y consultar localmente registros del portal PARES de Movimientos Migratorios.

El flujo está dividido en dos partes:

1. Un scraper en Python que recorre el listado paginado, descubre todos los `nid` y descarga cada ficha de detalle.
2. Una app en Next.js que consulta el dataset local y permite buscar por nombre/apellido o año de nacimiento, conservando el link al listado original (`p=`) y a la ficha fuente.

## Stack

- Python 3
- `requests`
- Next.js 15
- React 19

## Estructura

- `scrape_pares.py`: scraper reanudable
- `app/page.tsx`: buscador principal
- `lib/dataset.ts`: carga y búsqueda server-side del dataset
- `data/pages.json`: estado del barrido de páginas
- `data/ids.json`: índice de `nid` descubiertos
- `data/details.jsonl`: fichas descargadas
- `data/detail_failures.json`: errores de detalle para reintentos
- `data/records.json`: export plano opcional

## Instalación

Instalar dependencia del scraper:

```powershell
python -m pip install requests
```

Instalar dependencias del frontend:

```powershell
npm install
```

## Scraping

Barrido del listado:

```powershell
python .\scrape_pares.py fetch-list --first-page 1 --last-page 3124 --delay 5
```

Descarga de fichas:

```powershell
python .\scrape_pares.py fetch-details --delay 5
```

Todo en una sola corrida:

```powershell
python .\scrape_pares.py run-all --first-page 1 --last-page 3124 --delay 5
```

Estado actual:

```powershell
python .\scrape_pares.py status
```

Exportar a CSV:

```powershell
python .\scrape_pares.py export-csv --output .\pares_migratorios.csv
```

Exportar a JSON plano:

```powershell
python .\scrape_pares.py export-json --output .\data\records.json
```

## Reanudación

El scraper es reanudable:

- si una página ya quedó en estado `ok`, no vuelve a descargarla;
- si una ficha ya está en `details.jsonl`, no vuelve a bajarla;
- si el proceso se corta, podés retomarlo desde el mismo comando.

## Dataset

Cada ficha descargada incluye, además de todos los campos de tabla:

- `nid`
- `detail_url`
- `page_num`
- `source_page_url`
- `record_title`
- `full_name`
- `birth_year`
- `fetched_at`

Esto permite que el frontend busque localmente y muestre:

- acceso a la ficha original;
- acceso al listado original donde apareció el registro;
- orden estable por `page_num` y `nid`.

## Frontend

Modo desarrollo:

```powershell
npm run dev
```

Build:

```powershell
npm run build
npm run start
```

La app no scrapea en runtime. Lee `data/details.jsonl` del lado servidor y resuelve las búsquedas localmente.

## Notas prácticas

- El listado tiene 3124 páginas.
- `objectsPerPage` no cambia el tamaño real de página; el backend devuelve 25 registros por página.
- La variable importante para paginar es `p`.
- Conviene usar pausas entre requests para evitar bloqueos del sitio remoto.
