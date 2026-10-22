# Discovery migration — 7 October 2026

Source: <previous workspace folder>
Destination: <workspace folder>

Copied the application source, workflow scripts, resources, scraper executable, data files, job output, reports, backups, and design system. Audit and validation artifacts are in archive\discovery-audit. The 12 Discovery CSV exports from Downloads are in exports.

Created a consistent SQLite backup. Integrity check passed. Snapshot contains 20,592 leads, 94 campaigns, 51 previews, and 3 reports. Updated the saved scraper path and current user guides to this folder. Installed dependencies from the local pnpm cache and rebuilt the production application successfully. The build reports seven filesystem tracing warnings in the existing backup module.

Redirected the existing Windows scheduled task "Discovery Workspace Worker" to this folder for its next launch. The currently running dashboard and worker were left running from the original folder. Their subsequent changes do not automatically sync to this copy. Before switching the running processes, finish or pause active jobs and refresh the database snapshot and job files from the original folder. Then stop the old dashboard and worker and launch start-discovery.ps1 and start-worker.ps1 here, or start the updated scheduled task for the worker.

The originals remain intact for recovery. Generated node_modules and .next files were recreated rather than copied. No outreach or new scraping jobs were started as part of migration.

## Runtime switch — 8 October 2026

Stopped the Discovery processes at the user's request and refreshed this workspace from the original database and saved job files. Integrity check passed with 20,841 leads. Both databases and job folders are retained under `data/switch-backups/2026-10-07T21-18-53.400Z`. Running jobs were marked interrupted with saved results retained for manual Resume. Saved searches and interrupted discovery jobs now use two Maps pages and automatic published-email lookup. New searches enable email lookup by default; scheduled searches can disable it. Contacts and opt-outs are preserved. Website email lookup uses three concurrent prospects and up to three concurrent contact pages per prospect; it does not verify deliverability.
