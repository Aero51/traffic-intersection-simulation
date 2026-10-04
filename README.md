# Traffic intersection simulation (Raskrsće)

A simulation of a signalised four-way intersection with pedestrian crossings, written
originally as a final-year project. The repository holds two versions:

| Folder | What it is | Status |
| --- | --- | --- |
| [`web/`](web) | TypeScript + Vite port that runs in the browser (also installable as a PWA) | **Active** |
| [`src/`](src), `nbproject/`, `build.xml` | Original JavaFX 2 (MVC) desktop application, built with NetBeans/Ant | Legacy, kept for reference |

## Web version

Features:

- **Control:** fixed-time, induction-loop (automatic), actuated, longest-queue, bus-priority and a
  learned (Q-learning) policy; pedestrian phases and an ambulance that pre-empts the signals.
- **Traffic:** cars, vans, buses, lorries, motorbikes and bicycles with per-driver differences;
  day–night cycle with rush hours, rain, and breakdowns that block a lane.
- **Analysis:** statistics and charts, level-of-service grades (A–F), a fuel/CO₂ estimate, a
  strategy comparison, a timing safety check and a best-timings search that is checked against
  Webster's formula; CSV export.
- **Scenarios:** ready-made presets, JSON save/load, and settings shareable through the URL.
- **Replay:** rewind and scrub through the last minute (Y).
- Croatian/English UI, installable as a PWA.

```sh
cd web
npm ci
npm run dev      # development server
npm test         # unit tests (vitest)
npm run format   # Prettier (CI runs format:check)
npm run train    # retrain the learned control policy (src/learned-policy.ts)
npm run build    # type-check + production build into web/dist
```

The site is deployed to Netlify from the repository root (see `netlify.toml`); CI runs type-check,
tests and the build for every change under `web/`.

## Legacy JavaFX version

Open the project in NetBeans with a JavaFX 2 SDK, or use the Ant `build.xml`. It is no longer
developed; new features go into `web/`.
