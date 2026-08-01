# `src/lib/`

## `analytics.ts`

Helper de analytics sobre [GoatCounter](https://www.goatcounter.com) (site code `grafitam`, sin cookies, sin banner de consentimiento). `initAnalytics()` inyecta dinámicamente `<script async src="//gc.zgo.at/count.js">` solo cuando `import.meta.env.PROD` es `true` — así `npm run dev` no ensucia las métricas. Se llama una sola vez a nivel de módulo en `main.tsx`, no dentro de un componente/`useEffect` (evita que `<StrictMode>` la duplique en dev).

`trackEvent(path, title)` registra un evento custom (`window.goatcounter.count({ path, title, event: true })`) — no-op seguro si `window.goatcounter` no existe (dev, ad-blocker, o el script `async` aún no cargó cuando ocurre el primer click), nunca lanza error. Instrumentado en `App.tsx` (cambio de tab, `/tab/manual`|`/tab/plan`|`/tab/horario`) y `PlanSelector.tsx` (`/plan/program` al elegir programa, `/plan/select` al completar la carga de un plan — miden intención vs. plan efectivamente cargado, sin doble conteo).

Como `base: '/GrafITAM/'` en `vite.config.ts`, el pageview automático inicial que dispara `count.js` se registra como `/GrafITAM/`, no `/`.
