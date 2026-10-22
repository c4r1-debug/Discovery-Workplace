# Discovery Workspace operations

## Ten improvements

1. **Live progress:** Search schedule → Job activity shows the current stage and available found, collected, new, duplicate, blocked and failed counts. Expand a search to review its linked leads and individual research/audit status. Durations exclude queue time; older runs without recorded timing say so.
2. **Pause and recovery:** Stop after current job pauses the queue after active work. Resume processing continues it. After a worker restart, interrupted discovery jobs retain their saved CSV and can be resumed from their activity folder. Failed discovery jobs can be retried. Duplicate leads remain deduplicated.
3. **Editable batches:** Edit a saved search to change frequency, weekdays, time window, batch quantity, total target and empty-run cutoff. Preview the next five eligible times before saving. The target counts new additions since tracking began; it does not retroactively count old imports. Jobs already active must finish or be cancelled before editing.
4. **Contact evidence:** Open a prospect to see contact classification, source and check date. Confirm a named owner using the name and source fields; otherwise use Practice inbox. Saved manual contact edits survive later research, including an intentionally blank email. Discovered addresses remain unconfirmed until reviewed; extraction does not establish email deliverability.
5. **Qualification:** Complete the prospect checklist and mark the lead Interested before ClickUp handoff. A phone or email is also required. Administrators can change the checklist in Settings; renamed requirements become unchecked on existing leads.
6. **Conversation brief:** Each prospect has up to three talking points grounded in saved findings and Maps information. Missing evidence produces fewer points. Blocked website checks are described as unknown rather than proof of a poor website. No message is sent automatically.
7. **Territories:** The sidebar groups saved searches by location with run counts, linked prospects and latest activity. Search a city or neighborhood separately to track it separately. This reflects recorded searches, not complete geographic coverage.
8. **Team workflow:** Assign an existing teammate, record last-contact date, agreed service and next action. Manual lead/qualification changes record who changed them and when. The displayed workspace history retains the latest 500 events.
9. **ClickUp preview:** Preview the exact task title and description, then confirm handoff. Changed prospect content requires a fresh preview. A saved task ID prevents repeat sends. An uncertain network/server response stays pending until someone checks ClickUp for the Discovery reference; do not clear it without checking. Configure the token and List ID in Settings first.
10. **Recovery and startup:** Administrator Settings includes daily local backups, Back up now, Restore, and optional worker startup at Windows login. Restore requires a paused queue with no running jobs, creates a safety backup first, signs everyone out and leaves interrupted jobs awaiting manual resume. Automatic backups run while the worker is online. Windows login startup launches only the worker; start the web application separately.

## Running locally

Worker status comes from the server's latest health check and keeps the existing 45-second deadline. Contact lookup uses an indexed blocked-website check so it does not reload the full prospect collection for every website. A worker stopping after its active job remains online until it actually exits; transient SQLite heartbeat errors are retried on the next tick.

Searches with automatic email lookup enabled check business websites while Maps collection is running, with three concurrent prospects. Email comes first: check the homepage, then the first usable Contact page if needed, and stop if neither publishes an email. Alternate Contact routes are tried only when a page fails. Phone numbers are collected second from those same downloaded pages and fill only missing numbers. The scraper includes existing prospects rediscovered without an email, preserves saved contacts, manual edits and exclusions, and records completed checks for resumable jobs. Manual website research uses the same contact extractor. Contacts retain their source URL and remain unconfirmed; JavaScript-only content is not rendered by this HTML crawler.

From `C:\Discovery`, run `npm run start` for a built application and `npm run worker` for background jobs. Browser inactivity does not stop the worker. Windows sleep, shutdown or loss of network still interrupts work; startup at login does not wake the laptop. Enabling Windows startup is optional and was not switched on during this update.

Backups live under `data/backups` and include account data, encrypted integration credentials, the encryption key, and scraper output. Keep them private. They stay on this laptop; copy a snapshot to another drive for device-loss protection. Restoration is for the local app data, not deployment or source-code rollback.

Administrator controls are visible only to administrator accounts. Existing member accounts retain their permissions.

## Validation

The automated tests cover contact preservation, qualification, scheduling, interrupted-run recovery and deduplication, backup restoration, session invalidation, and ClickUp preview/duplicate handling. HTTP integration tests exercise the signed-in API and permission boundaries with an isolated database. ClickUp delivery is tested using simulated responses; no real task or outreach message is sent by the tests.

Google Maps counts are sampled discovery results, not a guaranteed total. A blank import limit removes the import cap but does not remove Google's result limits or the worker runtime cap. Blocked sites continue to use available Maps information without repeated website research or audits.
