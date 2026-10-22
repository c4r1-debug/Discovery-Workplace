# Discovery Workspace interface

Applied using UI UX Pro Max, installed at `C:/Users/admin/.codex/skills/ui-ux-pro-max` from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.

## Direction
Aurora Glass across the internal prospecting workspace: midnight blue with violet/cyan gradients in dark mode, pale lavender with frosted white surfaces in light mode. Retain Discovery's logo, Manrope/DM Sans fonts, navigation, and control placement. The UI/UX style search matched Glassmorphism; use its layered surfaces with blur only on the sidebar and topbar. Prospect tables and dialogs use opaque surfaces for readable contact details.

`app/aurora.css` defines shared semantic tokens for both themes, including login, autocomplete, status badges, native dialogs, and loading states. Client reports and print output retain the original white report palette. No new fonts, animation package, or recurring background animation.

## Theme
- Default to dark. The sun/moon control beside Refresh and on login switches themes without remounting the workspace.
- Store only `dark` or `light` in browser storage under `discovery-theme`; restore before first paint. Storage failures still permit switching for the current visit.
- Use visible keyboard focus, at least 44px controls, and readable foreground/background contrast in both themes. Disable transitions under reduced motion.

## Screen responsibilities
- Discover: keyword/location search, optional map preview, links to saved prospects and job activity.
- Prospects: filters, 50 rows per page, current-page map pins, bulk selection across matching results, exports.
- Search schedule: saved automations and collapsed search folders. Mount folder contents only on expansion.
- Audit reports: preserve the owner-facing report layout and editable Word download.

## Interaction
- Keep existing actions and saved data. Prospects use server pagination; all matching selection/export still works across pages.
- Refresh at most one workspace request at a time, every 30 seconds while visible, plus on return to the tab and after actions. Provide manual Refresh.
- Use 44px control targets, text labels for icon controls, keyboard focus rings, and reduced-motion support.
- Preserve readable sidebar navigation on mobile with accessible labels.

## Performance boundary
Keep server pagination, lazy collapsed folders, optional maps, existing polling, and server-derived worker health. Theme changes introduce no requests or scraper/API/database changes. Preview against isolated data while a scrape is running, and deploy the web dashboard independently of the worker.
