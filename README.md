# Discovery

## Batch automation

Choose **Discover → Schedule batches** (or **Search schedule → New batch automation**). Set the keyword, location, IANA time zone, local start time, 1–500 new prospects per batch, repeat interval, allowed weekdays and optional same-day time window. Switch scheduling on/off in Saved searches. Days are 24-hour intervals; allowed days/window use the selected zone, including daylight saving changes. Windows control batch start, not an active batch's end. The laptop and worker must remain awake. Missed runs combine into one batch, and a schedule does not queue overlapping batches.

The first batch collects Maps results. Remaining records stay on disk for later batches without another scrape. Once exhausted, the next run searches again; duplicates are skipped. Batch quantity is an import limit, not a promise of that many new matches or exhaustive geographic coverage.

Gosom's premature inactivity cutoff is disabled (`-exit-on-inactivity 0`). A 60-minute maximum runtime still protects against stuck processes. Empty output is reported as failed instead of successful zero results. Valid partial output is imported when possible. Failed jobs are not immediately retried automatically. Previously completed zero-result jobs keep their original history; run a new search to retry.

Local prospect research workspace for your team. Next.js dashboard, SQLite storage, and a separate Windows worker using Gosom and Lighthouse. No prospect data is seeded by default.

## Start

On this configured laptop, double-click **Discovery Workspace** on your desktop (or **Start Discovery.cmd** in this folder). It opens `http://127.0.0.1:3000/` in your default browser automatically, reuses an existing dashboard, or starts it in the background with logs under `data/web-logs`. The scraper worker remains separate; its existing Windows login startup setting still applies.

Requires Node.js 22.13+ (Node 24 recommended) and pnpm. From this folder:

```powershell
pnpm install
pnpm build
pnpm start
```

Open http://localhost:3000 and choose Create an account to register a username and password (12+ characters). There are no default credentials. In a second terminal:

```powershell
pnpm worker
```

Alternatively, `pnpm dev` starts the development server. `start-discovery.ps1` and `start-worker.ps1` can locate the bundled Codex Node runtime on this machine if pnpm is not on PATH.

## Accounts and recovery

The first account is the administrator; later accounts are members of the same local workspace. Existing accounts and data are preserved, with the first existing account becoming administrator. Usernames are case-insensitive. Save the recovery code shown after registration. Forgot password uses this code, revokes existing sessions, and issues a replacement code. Settings lets an existing account generate a code after confirming its password. Email recovery is not configured.

## Gosom

Install Gosom (tested with v1.18.0) at a path such as `C:\Discovery\tools\google-maps-scraper.exe` from the official GitHub release. The Settings path must point to that executable, not a folder for saving leads. Discovery validates it when saving settings and queuing searches.

Set the path to your validated Gosom executable in Settings, or choose Docker if Docker Desktop is installed and running. The Docker image is `gosom/google-maps-scraper`; this app invokes its CLI with the selected concurrency (1 or 2) and a scroll depth based on the requested limit; website email research runs separately. The numeric batch setting caps newly imported records, not Gosom's underlying network requests or total discovered places. Raw job CSVs remain in `data/jobs` for review. You can also import Gosom CSV/JSON from the dashboard.

## Research and audits

### Discovery controls

Location autocomplete uses a local GeoNames index of countries, first-level regions and major cities (see `resources/ATTRIBUTION.md`). Unlisted locations can still be entered manually. Region searches show their listed cities before running: select areas and add missing towns, one per line. The cities15000 directory mainly contains places above 15,000 people; a short list is directory coverage, not a five-city cap. Stable area IDs preserve progress when the selection changes.

Selecting a suggested location starts a lightweight map preview after the keyword settles. For a manually typed location, use **Preview map results**. Previews show real returned businesses with pins, reuse cached results, and do not import prospects or run website checks. The count is a sample of discovered listings, not a total of every business on Google Maps.

A blank prospect limit means no import cap. Gosom searches more deeply in this mode, with a maximum run time of one hour. Google’s result limits, blocking, query interpretation and a finite scroll depth still limit coverage: this does not guarantee every listing inside an administrative area. A numeric limit caps newly imported prospects.

Prospects can be selected individually or using **Select filtered**. **Export selected** downloads those records; **Export all CSV** downloads the entire collection regardless of filters. GoHighLevel contact columns lead the CSV, followed by service opportunity and preserved research data. Nested Maps details, findings and reports are JSON within quoted CSV cells. Spreadsheet-formula-like values are prefixed with an apostrophe; only validated E.164 values in the Phone column retain a literal plus sign. Postal codes remain strings. See USER-GUIDE.md for field mapping and opportunity thresholds.

The UI defaults to compact **GoHighLevel CSV**, omitting Maps/research/report blobs to keep imports small; **Complete data CSV** retains them. Both support selected and all-record exports. Direct API export calls retain the complete format unless `format: 'gohighlevel'` is provided.

Gosom structured addresses are retained on new imports. For older records, `node scripts/recover-addresses.mjs` previews recoverable fields from saved job CSVs. `--apply` backs up affected originals and fills only missing fields in one transaction; no research is queued.

Imports save Maps details without queuing website research. Open a prospect and choose **Check website & contacts** to request it. Website research checks public HTML and up to three same-site contact/about links for published emails. Explicit owner/founder structured-data names become *candidates* for manual verification. It does not guess email addresses or prove deliverability. Missing contacts are retained.

Mark a prospect hot or record an audit request before queuing a full report. Lighthouse runs Chrome/Edge locally in mobile and desktop modes. The worker auto-detects common browser paths or accepts one in Settings. Browser traffic passes through a proxy that blocks private-network destinations. Lighthouse findings are lab observations, not conversions or legal/accessibility certifications. Local SEO heatmaps, directory-wide comparisons and comprehensive review-response analysis are not included.

Workspace administrators can approve reports, create share links, and revoke them. All signed-in accounts can review internal drafts. Printing produces a PDF through the browser. Shared reports become accessible to anyone holding the link. Localhost links only work on this laptop; remotely accessible reports require deployment.

## Optional integrations

Audit reports now lead with an evidence-based owner summary, priority cards and mobile/desktop comparisons. Technical findings are collapsed on screen and included in the print appendix. Download Word (.docx) exports editable paragraphs and tables plus embedded screenshots; upload that file to Google Drive to edit it with Google Docs. The export uses the same interpretations as the report, preserves draft labels, and follows the same sign-in/share-token permissions. Revoking a share link also revokes future downloads; already downloaded copies remain with their recipients.

- AI: enter a provider, model, and key. Gemini and OpenCode free allowances depend on the selected model/account; DeepSeek API is paid. The app enforces a daily request cap, has no automatic provider fallback, and works without AI. It sends public website findings, not internal sales notes. A request cap is not a dollar spending cap: keep billing disabled at your provider for free-only use.
- ClickUp: enter your personal API token and List ID. Mark a lead Interested and explicitly send it. A local task ID prevents repeat exports. If a network failure leaves the result uncertain, the pending flag blocks retries until you check ClickUp for the reference ID.
- Maps: Leaflet displays imported coordinates on an OpenStreetMap basemap with attribution. Map markers and the list share filters and display 50 prospects per page. Select filtered includes matches across all pages. Click a marker to open a lead or click the map to select a radius center. Radius filtering excludes records without coordinates. No Google Maps browser key is needed; each prospect retains its Google Maps source link. Public OSM tiles are used interactively only, with no bulk download or offline prefetch.

## Schedules

Use Schedule batches to choose a start date, time zone, interval, weekdays, optional time window, batch size, total new-prospect target and consecutive-empty-run limit. Edit a saved search to preview its next five eligible run times. Existing weekly searches keep their timing until edited. On/off stops future scheduled runs; separately cancel queued jobs in the UI. When the laptop resumes, one overdue run is queued rather than replaying every missed interval. The worker must be running and the laptop awake for jobs and schedules to progress.

Stop after current job lets active work finish before pausing the queue. Resume processing restarts the queue. Interrupted running jobs are marked interrupted on worker restart; use Resume in their activity folder to reuse saved scraper output. Failed discovery jobs offer Retry. These actions are deliberate, not automatic infinite retries. A resumed scraper may revisit the listing while skipping saved businesses; it does not restore the exact browser scroll position. Runs retain a one-hour maximum runtime.

See [the operations guide](OPERATIONS.md) for the ten workflow improvements and their controls.

## Storage and deployment boundary

Local data and the encryption key live in `data/` (gitignored). Back up the entire folder together, and protect it using Windows account permissions and disk encryption. Passwords use scrypt; session tokens are hashed and HttpOnly cookies expire in seven days. API mutations require a same-origin request. Account creation only accepts localhost origins.

This edition deliberately binds to loopback. It is **not ready to deploy directly to Vercel**: SQLite and the local worker require persistent storage. A hosted edition needs a shared database, authenticated worker API, and production session/HTTPS configuration before pointing `your own domain` at it. No DNS changes or paid services have been configured.

## Validate

```powershell
pnpm test
pnpm build
```

Core tests use isolated temporary databases. Integration tests can run against a separate `DISCOVERY_DATA_DIR`; never use test accounts in the real workspace.

## Upstream projects

- Gosom: https://github.com/gosom/google-maps-scraper (MIT; invoked separately, not vendored).
- Lighthouse: https://github.com/GoogleChrome/lighthouse (Apache-2.0; installed dependency).
- Other dependencies retain their package licenses. Software licenses do not replace source website terms.

