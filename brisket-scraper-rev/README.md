# Brisket Scraper (revised)

A production-ready rewrite of the mz-scraper UI + API with Netlify Functions (modern API), Background Functions for long crawls, Netlify Blobs for job state, and a selector-first / Readability fallback extraction pipeline.

## Highlights

- **Modern Netlify Functions**: default export handlers returning `Response` objects.  
- **Background worker**: `crawl-background.ts` handles multi-page crawls without 10s limits.  
- **Blobs storage**: jobs and results persisted in `@netlify/blobs`.  
- **Selector-first**: you choose the link selector; we fall back to hints and Readability on detail pages.  
- **Encoding‑safe**: `html-encoding-sniffer` + `iconv-lite` to handle non-UTF8.  
- **Robots-aware**: checks robots.txt and respects disallow/crawl-delay.  
- **Polite**: base delay + jitter per request; optional same-origin constraint.  
- **Sanitized**: Readability text + DOMPurify-sanitized HTML.

## Quick start

```bash
npm i
npm run dev
# open http://localhost:8888 (Netlify Dev)
```

## Deploying to Netlify

1. Push this repo to GitHub.  
2. Create a new Netlify site from GitHub, pick this repo.  
3. Accept defaults — `npm run build` and `dist/` publish dir — or set in `netlify.toml`.  
4. Deploy. The UI hits `/api/*` which redirects to `/.netlify/functions/*`.

## API shape (for reference)

- `POST /api/schema` — { startUrl, sameOriginOnly? } → infer link selector & next text.  
- `POST /api/jobs` — start a crawl; returns { jobId, status: "queued" } and invokes background worker.  
- `GET /api/jobs/:id` — job status + items and logs.  
- `GET /api/export?jobId=...&format=csv|json|txt` — export results.  
- `GET /api/robots?url=...` — quick robots check.

## Local dev notes

- Netlify Dev proxies `/api/*` → functions automatically; in production the TOML redirect applies.  
- TypeScript is used for both UI and functions; Netlify bundles the `.ts` handlers via esbuild.

## Safety notes

- SSRF guard blocks localhost/private ranges and only allows http/https.  
- jsdom scripts are disabled (default).  
- DOMPurify sanitizes the article HTML; we expose text and sanitized HTML.

## License

MIT (see LICENSE)