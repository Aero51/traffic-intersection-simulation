# Traffic intersection simulation (Raskrsće)

A simulation of a signalised four-way intersection with pedestrian crossings, written
originally as a final-year project. The repository holds two versions:

| Folder | What it is | Status |
| --- | --- | --- |
| [`web/`](web) | TypeScript + Vite port that runs in the browser (also installable as a PWA) | **Active** |
| [`src/`](src), `nbproject/`, `build.xml` | Original JavaFX 2 (MVC) desktop application, built with NetBeans/Ant | Legacy, kept for reference |

## Web version

Features: fixed-time, induction-loop (automatic) and adaptive control, pedestrian phases,
buses / lorries / motorbikes / ambulance, day–night cycle with rush hours, rain, statistics and
charts, timing safety check, best-timings search, CSV export, Croatian/English UI, and settings
shareable through the URL.

```sh
cd web
npm ci
npm run dev      # development server
npm test         # unit tests (vitest)
npm run build    # type-check + production build into web/dist
```

The site is deployed to Netlify from the repository root (see `netlify.toml`); CI runs type-check,
tests and the build for every change under `web/`.

## Legacy JavaFX version

Open the project in NetBeans with a JavaFX 2 SDK, or use the Ant `build.xml`. It is no longer
developed; new features go into `web/`.
