# Discovery Workspace user guide

## Faster Maps collection

### Background worker on Windows

The **Discovery Workspace Worker** task starts at Windows sign-in, runs hidden, and restarts a stopped worker after 60 seconds. Windows Task Scheduler also retries the supervisor if it fails. You must stay signed in; locking Windows is fine. The laptop must remain awake. This does not change sleep or battery settings.

Persistent logs are in `data/worker-logs`: `supervisor.log` records starts, exits and retries; timestamped `*-output.log` and `*-errors.log` files capture each worker session. Existing job scraper logs remain in `data/jobs`. These local logs are retained until you remove them. During installation, an already-running interactive worker is monitored without interruption; new worker sessions run hidden after that existing process exits. An interrupted scrape retains its results and can be resumed from Job activity; restarting the worker does not automatically replay interrupted jobs.

Use **Settings → Worker and recovery → Disable worker at Windows login** to disable future automatic startup. The current worker is left running to preserve active work.

In Discover, choose **Single location** or **State / region areas**. For a region, select its full name and country from the location suggestions. Review the listed cities, select the ones to search, and add missing towns one per line. The offline cities15000 directory mainly contains places above 15,000 people, so a region may show only a few cities. The worker searches the selected areas, largest listed cities first. This improves coverage but cannot guarantee every business in the region.

Choose **1 concurrent Maps page** for lower laptop load or **2** to try faster collection. This controls concurrent pages inside Gosom; areas are processed one at a time. New prospects are saved during collection and become available on the next workspace refresh. Maps imports no longer automatically queue website research. Open a selected prospect and use **Check website & contacts** when needed; full audits still require a hot lead or an audit request.

The new-prospect limit applies across the area's queue for that batch. Saved CSV rows and unfinished areas are reused on the next run. Job activity shows area status, new prospects per minute, duplicates and last progress time. A stalled search (five minutes without a new prospect), or a chunk containing at least 100 duplicates without new prospects, is stopped and marked incomplete; a region search can then try the next area. Use Resume / retry for incomplete work. Completed areas are skipped for 30 days unless **Refresh areas searched within the last 30 days** is enabled in the batch editor. Existing prospect details and manual research are preserved.

Keep the laptop awake and the worker running; the browser can be closed. A scheduled batch starts only in its allowed window, and the active batch can finish outside it. Region schedules turn off after every selected area has completed. Completed single locations become eligible again after 30 days; skipping a recent area does not count as an empty run. Pause stops after the current job, not immediately. No scraping speed or complete-coverage guarantee is implied.

Updated October 1, 2026 · Windows local edition

Discovery Workspace helps your team find businesses through Google Maps, review their available contact information, inspect websites, prepare audit reports, and hand qualified leads to ClickUp. It supports your sales preparation; it does not automatically contact prospects or run your delivery projects.

## 1. Start the app on your laptop

You need two running programs: **the dashboard** and **the worker**. The dashboard lets you view and manage data. The worker handles searches, research, audits and scheduled batches.

### Everyday startup

1. Open **PowerShell** from the Windows Start menu.
2. Run these commands in that window:

   ```powershell
   cd 'C:\Discovery'
   .\start-discovery.ps1
   ```

3. Leave that window running. When it says **Ready**, open **http://127.0.0.1:3000/** in your browser.
4. Open a **second PowerShell window** and run:

   ```powershell
   cd 'C:\Discovery'
   .\start-worker.ps1
   ```

5. Leave this window running too. It should say **Discovery worker is online**. The dashboard should show **Laptop worker online** after its next refresh.
6. Sign in with your existing Discovery username and password. If Settings says processing is paused, choose **Resume processing** when you want queued work to run.

These two scripts already exist in your project. They locate Node on your computer, including the bundled Codex runtime when Node is not on PATH. They do not install dependencies or build a missing application.

If PowerShell blocks a startup script and Node is available, run the underlying commands instead, from the same project folder:

```powershell
# Dashboard window
node node_modules/next/dist/bin/next start --hostname 127.0.0.1
```

```powershell
# Separate worker window
node scripts/worker.mjs
```

If the dashboard or worker is already running, do not start a second copy. An address-in-use message usually means a dashboard is already using port 3000. An “Another Discovery worker is running” message means the existing worker should be used.

### First installation or after a code update

For an installed, already built app, skip this step during daily startup. When dependencies or code have changed, stop the dashboard and use:

```powershell
cd 'C:\Discovery'
pnpm install
pnpm build
```

Then start the dashboard and worker as above. Node.js 22.13 or newer is required; this laptop has been using Node 24. If worker code changed, let its current job finish before restarting it. `pnpm dev` is for development, not the normal daily workflow.

### Stop safely

1. Choose **Stop after current job** in Search schedule or Settings.
2. Wait until the active job finishes. This pauses processing; it does not close the worker program.
3. Press **Ctrl+C** in the worker terminal to exit it. Press **Ctrl+C** in the dashboard terminal when finished using the app.

Closing the browser does not stop a separately running worker. Closing its terminal, Windows sleep, shutdown, or loss of internet can interrupt work. The laptop must remain awake and connected for remote searches. An interrupted discovery job can be resumed from Job activity after the worker restarts.

## 2. Accounts and team access

- Use separate usernames and passwords. There are no default login credentials.
- The first workspace account is the administrator; later registrations are members. Creating another account does not create a separate private workspace.
- Accounts in this workspace share prospects, search history and reports. Assignment identifies responsibility; it does not hide a prospect from teammates.
- Administrator-only controls include report approval, backup/restore, Windows startup and qualification rules.
- Save your account recovery code privately. **Forgot password** uses that code, not an emailed reset link. A successful reset signs out existing sessions and provides a replacement code.
- In Settings, you can generate a new recovery code after entering your current password; it replaces the old one.

The app currently runs on this laptop. Opening `127.0.0.1` on Kurt’s computer points to his own computer, not yours. Cloudflare Tunnel and Access have been discussed as a future setup; this guide does not configure them. A purchased domain alone does not make this local app remotely accessible.

## 3. What each screen does

| Screen | Purpose |
|---|---|
| Discover | Search a market, preview returned map listings, review prospects and import/export CSV. |
| Prospects | Search, filter and review the shared prospect collection. |
| Search schedule | Create and edit batch schedules, view job folders, monitor progress and control processing. |
| Territories | Review saved searches grouped by location and their linked prospects. |
| Audit reports | Review generated reports; administrators approve or revoke sharing. |
| Settings | Configure report branding, scraper/browser paths, integrations, recovery and worker controls. Administrators also manage backups and qualification rules. |

## 4. Find prospects

1. Open **Discover**.
2. Enter a business keyword, such as **Dentist**.
3. Enter a location, such as **Newark, New Jersey, United States**. Choose an autocomplete suggestion when available; you may also type a location manually.
4. Set **New prospect limit**, for example **50**.
5. Click **Find prospects**.
6. Open **Search schedule → Job activity**, then expand the search folder to view progress and linked businesses.

The separate map preview samples returned businesses. It does not save prospects or represent the total number of businesses in Google Maps. A preview itself needs the worker when a fresh search is required.

### Understand the limits

| Setting or result | Meaning |
|---|---|
| Limit 50 | Import up to 50 new prospects. The scraper may collect more listings first. |
| Blank limit | No import cap; finite search depth and the one-hour run limit still apply. |
| Found / collected | Listings discovered and details collected so far. |
| New | Businesses added to your workspace by this import. |
| Duplicates / existing | Businesses already in the workspace; another copy is not added. |
| No new prospects | May mean all returned businesses were already saved. It does not prove the region has no other businesses. |

A regional search runs a query such as “Dentist in Oregon.” It does **not** automatically visit every city or scan every map area. Use separate city or neighborhood searches for broader coverage. Territory tracking records your searches; it is not a map of complete market coverage. Google may also return loosely related or nearby matches, so verify fit.

### Businesses without websites

These businesses can still be saved with available Maps information: name, address, phone, category, rating, review count, location, Maps link, and other returned details. Website research is not automatically queued when no website exists. Full website audits require a website.

To find these leads, use **More filters → Website → Without website**. A lead without an email is currently labelled **Missing contact**, even if a phone number is present.

## 5. Review and qualify a prospect

Open a prospect using its **Review** button. Check the Maps overview, reviews and About information provided by the scraper. Missing fields mean the source did not supply them; review samples are not necessarily complete.

For a business with a website, basic research looks for published emails and website signals. Any detected owner names are candidates to verify, not automatically confirmed decision-makers. Extracted emails can include generic, example or unrelated addresses: check their source before outreach.

Suggested review sequence:

1. Confirm business type, location and relevance to your services.
2. Verify the email, phone and contact source. Save a confirmed owner’s name and source when available; otherwise classify an appropriate email as **Practice inbox**.
3. Save corrected details. Manual contact edits are preserved during later research, including a deliberately blank email.
4. Assign a teammate and record the agreed service, last-contact date and next action.
5. Update the status and complete the qualification checklist when supported by your actual conversation.

The **Conversation brief** suggests talking points based on saved evidence. It may contain fewer than three points when evidence is limited. It does not send a message.

| Status | How to use it |
|---|---|
| New | Not yet reviewed. |
| Missing contact | Contact research or manual verification is needed. |
| Ready for review | Available contact information is ready for human review, not guaranteed valid. |
| Contacted | You have contacted the prospect. |
| Interested | The prospect has expressed interest; record what was discussed. |
| Disqualified | The business is not a suitable fit. |
| Do not contact | Record an opt-out or instruction not to contact. |
| Sent to ClickUp | The app has recorded a successful ClickUp handoff. |

If a website blocks access, Discovery keeps Maps information and stops further website research/audits for that blocked lead. A blocked check is not proof that the website is poor. Do not repeatedly queue the same blocked work.

## 6. Audit reports and editable downloads

1. Open a prospect with a website.
2. Mark **Hot lead** or **Audit requested**, as appropriate, and save the details.
3. Click **Run full audit**. Keep the worker running; it uses an installed Chrome or Edge browser.
4. Monitor Job activity, then open the result through **Audit reports**.
5. Review the owner summary, priority cards, mobile/desktop comparison, screenshots and technical findings.

Reports explain observed issues in plain language. Scores do not measure lost customers, revenue, Google ranking or legal compliance. Lighthouse results are lab measurements and can vary between runs. A booking button detected in HTML does not prove the booking process works; check it manually.

### Output choices

- **Print / Save PDF:** use your browser’s print dialog and select Save as PDF.
- **Download Word (.docx):** download editable text and tables, with screenshots embedded as images.
- **Google Docs:** upload the downloaded `.docx` to Google Drive and open it with Google Docs. There is no direct Google Docs integration. Review formatting after import.

Drafts carry **Draft — Not approved for sharing**. An administrator reviews the report and uses **Approve & create link** when appropriate. Revoking a share link blocks future access and downloads through that link, but cannot recall copies already downloaded.

A localhost share link works only on this laptop. For now, send a reviewed exported file through your usual process. If Cloudflare Access later protects the entire app, clients will not automatically be able to open reports; public report access needs a separate design.

## 7. Scheduled batches and job history

Choose **Discover → Schedule batches** or **Search schedule → New batch automation**. Set the keyword, location, time zone, start time, batch quantity, repeat interval, allowed weekdays and optional time window. You can also set a total new-prospect target and a cutoff after consecutive runs with no new prospects.

Review the next five eligible run times before saving. A window controls when a batch starts; a running batch can finish after the window closes. A “Days” interval means 24 hours, with allowed days and windows checked in the selected time zone. Do not confuse your laptop’s time zone with the market’s time zone.

Later scheduled batches use remaining saved results first. When those run out, the app searches again and skips duplicates. Missed scheduled runs combine into one overdue run instead of replaying every missed interval. Jobs for the same search do not overlap.

- **Schedule off:** prevents future automatic work for that schedule. It does not stop an active job. Scheduled queued work is cancelled when the worker checks the disabled schedule; separately cancel queued manual work if needed.
- **Stop after current job:** pauses overall queue processing after the active job finishes.
- **Resume processing:** lets queued work continue.
- **Retry / Resume:** deliberately reruns failed or interrupted discovery jobs, reusing saved output where available. It may revisit the listing; it does not restore the exact browser scroll position.
- **Edit:** change a saved search after its active batch finishes or queued work is cancelled.
- **Delete / Delete selected:** removes saved searches from the list while keeping previously saved leads and job history.

Expand a job folder to inspect its leads and statuses. Durations exclude time waiting in the queue. Older jobs may have no timing data.

## 8. Export prospects and hand off to ClickUp

Use row checkboxes or **Select filtered**, then **Export selected**. **Export all CSV** exports the entire prospect collection, regardless of current filters. Some nested information, such as Maps details, appears as structured text inside CSV cells. Manual CSV/JSON imports accept up to 10,000 rows per import; this is not the total storage limit.

Choose **GoHighLevel CSV** (the default) for a compact contact import. Choose **Complete data CSV** when you also need captured Maps reviews, research, and reports; this file can exceed CRM upload limits. Both formats support Export all and Export selected.

CSV exports begin with GoHighLevel contact fields: **Business Name, Name, Email, Phone, Address, City, State, Postal Code, Country, Website**. Address is the street portion; Country uses a two-letter code such as US. Upload the original CSV directly so spreadsheet software does not remove leading zeroes from postal codes or change phone numbers.

Phone is validated and exported in international format, for example `+12025550143`. Invalid or ambiguous numbers leave Phone blank; review **Original Phone** and **Phone Review**. Extensions are separate in **Phone Extension**. National numbers need a known country. Missing address data stays blank; no city or postal code is invented.

In GoHighLevel, create a contact custom dropdown **Opportunity Level** with **Low, Mid, High**, and text fields **Opportunity Reason** and **Suggested Service**, then map those columns during contact import. Skip extra raw-data columns you do not need. This rating does not create a sales pipeline deal. Rows without an owner name, email, or valid phone need a contact identifier before import.

Service opportunity uses observed website needs: **Low** for a website-gap score below 25, **Mid** for 25–49, **High** for 50–100. A listing with no website is High for website development, subject to manual confirmation. Blocked/unchecked websites and excluded prospects remain **Not assessed** in the app and have a blank Opportunity Level in CSV. Missing booking controls suggest a booking/CRM discussion; this does not prove the business lacks a CRM. Ratings are service-fit indicators, not predictions of a sale.

Formatting reference: [HighLevel CSV requirements](https://help.gohighlevel.com/support/solutions/articles/155000005143), [custom-field mapping](https://help.gohighlevel.com/support/solutions/articles/155000004432).

For ClickUp, enter your token and destination List ID in Settings. Complete the qualification checklist, provide an email or phone, and set the lead to **Interested**. Choose **Preview ClickUp handoff**, review the exact content, then **Confirm handoff to ClickUp**. A changed prospect requires a fresh preview.

The saved ClickUp task ID prevents repeat handoffs. If a send has an uncertain result, check ClickUp for its Discovery reference before clearing the pending state or trying again. Discovery does not automatically send cold emails or manage the full delivery project.

AI drafting is optional. The app and its template-based report interpretations work without an AI key. If you enable a provider, check that provider’s pricing first: an app request limit is not a dollar spending limit.

## 9. Settings, backups and storage

The Gosom path must point to the executable, not an output folder. On this laptop it was installed at:

```text
C:\Discovery\tools\google-maps-scraper.exe
```

Chrome/Edge can usually be detected automatically. If detection fails, set the path to the installed browser executable. Keep **Public application URL** local until remote access is configured.

Local data is in `C:\Discovery\data`. Backups are in its `backups` subfolder; raw scraper output is in `jobs`. The app has no fixed maximum prospect count, but disk capacity and dashboard performance impose practical limits. It currently loads the full prospect collection; pagination and load testing would be needed before relying on very large collections.

### Backup routine

Administrators can use **Settings → Worker and recovery → Back up now** and enable daily automatic backups. Daily backups occur while the worker is running. Copy backups to a separate drive for protection against laptop loss. Backups contain accounts, credentials and the encryption key; keep them private. CSV exports alone are not a full workspace backup.

### Restore a backup

1. Pause processing and wait until no job is running.
2. As an administrator, choose the snapshot and **Restore**.
3. Review the confirmation carefully: it replaces current app data with that snapshot. The app creates a safety backup first.
4. Sign in again. Review interrupted jobs before resuming them and resume queue processing when ready.

Backup restoration restores app data, not an older version of the application code.

**Enable worker at Windows login** is optional and administrator-only. It starts the worker, not the dashboard, and does not wake a sleeping laptop. Avoid launching a second worker if automatic startup already started it.

## 10. Troubleshooting

| Symptom | What to check |
|---|---|
| Browser says it cannot connect | Start the dashboard and wait for Ready. Use `http://127.0.0.1:3000/`. |
| Production build missing | Run `pnpm install` if needed, then `pnpm build`, before starting the dashboard. |
| Node or pnpm not recognized | Use the existing startup scripts for daily startup. For installation/build issues, verify the Node/pnpm installation rather than changing app data. |
| Jobs stay queued | Check worker online status, paused processing, allowed schedule times and whether another job is active. |
| Search returns zero new leads | Compare collected and duplicate counts. Try a distinct city/keyword if existing matches were already saved. |
| Scraper saves no businesses | Read the job error. Maps may have returned no usable results, blocked access, or the scraper may have failed. |
| `spawn ... ENOENT` | Check the Gosom executable path. A folder or missing executable will not work. |
| Website returned 403 / access blocked | Use the saved Maps details. Repeated website audits will not resolve blocked access. |
| Full audit button unavailable | Save Hot lead or Audit requested first; a website is needed and blocked sites cannot be audited. |
| ClickUp confirmation unavailable | Check credentials, List ID, Interested status, contact details and completed qualification. |
| Backup or approval controls missing | Sign in with the workspace administrator account. |
| Kurt cannot open your localhost link | Remote access is not yet configured; his localhost address is not your laptop. |
| Password forgotten | Use the latest saved recovery code. Email reset is not configured. |

## 11. A practical daily routine

1. Start the dashboard and worker; confirm the queue is in the intended state.
2. Run a focused search or review scheduled batches.
3. Verify contact sources and business fit; assign the next action to a teammate.
4. Perform outreach through your usual tools and record the outcome in Discovery.
5. Audit hot/requesting prospects, review the report, and export or approve it.
6. Hand genuinely interested, qualified prospects to ClickUp after checking the preview.
7. Confirm a recent backup, then pause and stop safely when finished.

Keep the laptop awake only when you intend processing to continue. No automatic outreach, remote hosting or paid integration is required for the basic local workflow.
# Interface update — September 24, 2026

- **Discover** now focuses on new searches. Use **Show map preview** only when you want to preview results; **Browse prospects** opens your saved collection.
- **Prospects** displays 50 records per page. Use Previous / Next below the table. Map view displays pins for the current page.
- **Select filtered** selects every matching prospect across pages. Export selected includes that entire selection; Export all CSV includes the full saved collection.
- Job folders load their visible contents when opened. Expand a prospect inside a folder to see its research and audit jobs.
- The workspace refreshes every 30 seconds while the tab is visible, and after actions. Use **Refresh** for an immediate update. Background scraping continues independently of the browser tab.
- These interface improvements do not change or delete saved leads. Server-side pagination and incremental workspace loading remain future performance work.
