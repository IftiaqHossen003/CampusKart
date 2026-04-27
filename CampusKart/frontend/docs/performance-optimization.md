# CampusKart Frontend Performance Workflow

## Bundle Baseline and Budget

Run from `frontend/`:

```bash
npm run build:analyze
```

Generated artifacts:

- `dist/bundle-analysis.json`
- `dist/bundle-analysis.txt`

Public first-load JS budget (entry + static shared imports): `200 KB` gzipped.

Enforce budget in CI/local:

```bash
npm run build:budget
```

This command exits with a non-zero status if the gzip budget is exceeded.

## Before vs After Baseline (Captured)

Baseline gap is now closed with reproducible artifacts stored under:

- `docs/bundle-baselines/before-refactor.bundle-analysis.json`
- `docs/bundle-baselines/before-refactor.bundle-analysis.txt`
- `docs/bundle-baselines/after-refactor.bundle-analysis.json`
- `docs/bundle-baselines/after-refactor.bundle-analysis.txt`

Capture date: `2026-04-21`

Comparison (public initial JS, entry + static imports):

- Before refactor gzip: `91,591 bytes` (`89.44 KB`)
- After refactor gzip: `90,093 bytes` (`87.98 KB`)
- Delta: `-1,498 bytes` (`-1.64%`)
- Budget check (`< 200 KB gzip`): `PASS`

## Notes on Current Splitting

- Route-level lazy loading remains in `src/App.jsx`.
- Heavy chart rendering is split into lazy chart modules:
  - `src/components/charts/AdminRevenueChart.jsx`
  - `src/components/charts/VendorRevenueChart.jsx`
- Vite manual chunks isolate route-shared dependencies (`react-router`, `react-query`, `swiper`) without forcing chart libraries into public first load.

## Future Rich Text Editor Pattern

No rich-text editor module is currently active in runtime.  
Use this pattern for future editor integrations so the editor code stays off public first load:

```jsx
import { Suspense, lazy } from "react";

const RichTextEditor = lazy(() => import("../components/editor/RichTextEditor"));

function EditorSection() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded bg-slate-100" />}>
      <RichTextEditor />
    </Suspense>
  );
}
```
