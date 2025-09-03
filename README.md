# mz-scraper — Netlify-first web scraper (brisketscraper.com)

**Deploy target:** Netlify (Functions + Background Functions + Blobs)  
**Frontend:** Vite + React (SPA)  
**API:** Netlify Functions (TS) with a Background Function for the crawl  
**Storage:** Netlify Blobs (jobs, pages, items, events)  
**Domain:** `https://brisketscraper.com`

> Teach once, reuse often. Polite, secure scraping. Live progress via SSE (with automatic long‑poll fallback). Exports CSV/JSONL/TXT.

---

## One‑shot deploy (from GitHub)

1. **Push this repo to GitHub**.
2. In **Netlify → Add new site → Import from Git**, pick the repo.
3. Set build settings:
   - **Base directory:** `/`
   - **Build command:** `npm run build`
   - **Publish directory:** `web/dist`
4. In **Site settings → Functions**, ensure directory is `netlify/functions`.
5. In **Site settings → Environment variables**, add (as needed):
   - `WEB_ORIGIN=https://brisketscraper.com`
   - `USER_AGENT=mz-scraper/0.1 (+https://brisketscraper.com)`
   - `BASE_DELAY_MS=1000`
   - `MAX_RETRIES=3`
   - `REQUEST_TIMEOUT_MS=15000`
   - `ALLOW_RAW_HTML=false`
   - `OPENAI_API_KEY=...` (optional, enables AI selector inference)
6. Set custom domain to **brisketscraper.com** in **Domains**.

> Local dev: `npm i -g netlify-cli` → `netlify dev` (runs SPA + Functions).

---

## What’s included

- **/web** — SPA orchestrates jobs, stores site profiles locally, shows live logs/results, exports CSV/JSONL/TXT.
- **/netlify/functions** — API endpoints:
  - `POST /api/schema` — infer selectors (OpenAI if configured; else heuristics).
  - `POST /api/jobs` — create a job and invoke **background** crawl runner. Accepts either a start URL (with link discovery) or an explicit list of URLs to fetch.
  - `GET /api/jobs/:id` — get job state + counts.
  - `GET /api/jobs/:id/events` — **SSE** stream of `log|item|done|error` (auto reconnect) or JSON long‑poll fallback.
- **Background function** — `/ .netlify/functions/run-job-background` (15‑minute runtime) performs the crawl and writes events/items/state to **Netlify Blobs**.
- **Politeness** — robots.txt, SSRF guard (IPv4/IPv6 private/loopback), per-host throttle with jitter, retries + backoff + `Retry-After`, circuit‑breaker on persistent 5xx/429, URL normalization/dedupe, same‑origin scoping.
- **Extraction** — readability‑style main content + `title`, `description`, `author`, `published_at`.
- **Headless** — behind a flag; Playwright not bundled by default (Netlify Functions are not ideal for headless browsers).

---

## Netlify specifics & streaming

- **Long jobs:** We use **Background Functions** (up to 15 minutes) for the crawl. (Per Netlify docs.)  
- **Streaming:** Synchronous functions can stream responses; however SSE can be flaky on some setups. We implement SSE with automatic reconnect and also expose a **JSON long‑poll** fallback so progress appears continuously.

---

## Scripts

```bash
npm i            # install root and web deps
netlify dev      # local SPA + Functions (needs Netlify CLI)
npm run build    # builds SPA for deploy (functions deploy as source)
```

---

## Folder map

```
mz-scraper/
├─ netlify.toml
├─ package.json
├─ web/                     # SPA (Vite + React + TS)
└─ netlify/
   └─ functions/
      ├─ api.ts            # routes /api/* (schema, jobs, events, fetch proxy)
      ├─ run-job-background.ts  # long-running crawler
      └─ lib/              # shared logic for functions
         ├─ types.ts
         ├─ url.ts
         ├─ ssrf.ts
         ├─ robots.ts
         ├─ extract.ts
         ├─ paginate.ts
         ├─ readability.ts
         ├─ blobs.ts
         └─ inference.ts
```

---

## Note on headless pages
If you truly need JS rendering for some sites, consider:
- a microservice with Playwright (container) called from the background function, or
- a separate queue + worker container (outside Netlify).

This repo keeps headless **off** by default for portability on Netlify Functions.
