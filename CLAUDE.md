# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single Google Apps Script (GAS) web app for Big C's Building Management Department: employee registration/org chart, refrigerator & aircon surveys, work orders, trip planning, EDMI solar meter surveys, CAPEX budget cross-checks, and related admin/report pages. There is no build step — `.gs` files are server-side Apps Script (V8 runtime), `.html` files are client pages/templates served via `HtmlService`, and Google Sheets act as the database (one spreadsheet, many tabs like `Employee_Database`, `Ref_Survey_Database`, etc.).

Note: the git repository root is this top-level `Air_Ref_Servey` folder, not the `Refride CM Plan` subfolder (which only holds unrelated PowerPoint decks). Always run `git`/`clasp` commands from the repo root.

## Deployment (clasp)

This project has no test suite or lint config — "verification" means pushing to Apps Script and exercising the page in a browser. Follow the clasp workflow in the global CLAUDE.md (`~/.claude/CLAUDE.md`) for locating/installing clasp and authenticating. Project-specific values:

- Script ID: see `.clasp.json` (`scriptId`) at repo root.
- Routine update:
  ```powershell
  & $clasp push --force
  & $clasp deploy --deploymentId <stableId> --description "<description> v<N>"
  ```
  Pushing alone only updates `@HEAD` (the dev URL); the stable/shared URL requires the `deploy` step.
- `.clasp.json` has `"skipSubdirectories": true` — files inside subfolders (e.g. `Pyhon ANL/`, `Store Data Backup/`, `Refride CM Plan/`) are never pushed to Apps Script. Only top-level `.gs`/`.html`/`.json` files are part of the deployed app.
- `appsscript.json` webapp block (`executeAs: USER_DEPLOYING`, `access: ANYONE`) controls who can open the URL — don't change without confirming with the user, since it affects who can access the live tool.
- After any deploy, do a fresh-tab test with a cache-busting query param — GAS aggressively caches HTML templates client-side (see feedback memory `feedback_gas_temp_diag_testing`).

## Architecture

### Routing
`Code01.gs`'s `doGet(e)` is the single entry point for every page in the app. It switches on `e.parameter.page` and returns `HtmlService.createTemplateFromFile('<Name>').evaluate()...` — there is no client-side router. To add a new page: create the `.html` file, add a new `else if (page == "...")` branch in `doGet`, and (if it needs data at load) pass values onto the template object before `.evaluate()`.

Some report pages intentionally skip synchronous server-side preload (`template.preloadedData = null`) because pulling a large sheet during `doGet` causes page-load timeouts; those pages instead fetch data asynchronously via `google.script.run` after load. Follow this pattern for any new report backed by a large sheet — don't reintroduce synchronous full-sheet reads in `doGet`.

### Client-server bridge
Every `.html` page talks to its `.gs` counterpart exclusively through `google.script.run.withSuccessHandler(...).<serverFunction>(...)`. There's no REST/fetch layer — server functions are plain top-level functions in the `.gs` files, callable by name from any page (Apps Script exposes all server functions globally to every page in the project, not just the "matching" file).

### File-to-feature mapping
Each feature area is a `.gs` file (server logic + sheet access) paired with one or more `.html` files (UI):

| Feature | Server (`.gs`) | Client (`.html`) |
|---|---|---|
| Employee registration / org chart / auth / password reset | `Code01.gs` | `index.html`, `report.html`, `auth.html`, `admin-password-reset.html`, `reset-password.html` |
| Refrigerator & aircon surveys | `Survey.gs` | `RefSurveyReport.html`, `AirconSurveyReport.html`, `ref_survey.html`, `np_survey.html`, `survey-config.html`, `survey-manual.html`, `ref_ac_map.html` |
| EDMI solar meter survey | `EdmiSolarSurvey.gs` | `EdmiSolarSurveyReport.html`, `edmi-manual.html` |
| Layout survey (pre-installation area survey for layout-change projects, e.g. Add Chill Bev) | `LayoutSurvey.gs` | `LayoutSurveyReport.html` (fill form is the `content-layout-survey` tab inside `index.html`, same as EDMI) |
| Work orders (general + Big C specific) | `WorkOrderReport.gs`, `BigCWorkOrder.gs`, `BigCWorkOrder_Delete.gs`, `addWorkOrderAttachment.gs` | `work-order-report.html`, `work-order-dashboard.html`, `bigc-work-order-report.html`, `broken-unit-summary.html` |
| Trip planning | `TripPlan01.gs` | `trip-plan-report.html`, `trip-plan-map.html`, `trip-plan-calendar.html`, `check_in.html` |
| Staff assignments | `Assignment.gs` | `assignment-report.html` |
| Safety incidents | `SafetyIncident.gs` | `safety-incident-report.html` |
| Upload schedule (survey collection scheduling) | `UploadSchedule.gs` | `upload-schedule.html` |
| CAPEX budget cross-check | `CapexBudgetCrossCheck.gs`, `CapexBudgetData.gs` | `capex-budget-crosscheck.html` |
| Lease screening data | `LeaseData.gs` | (consumed by CAPEX cross-check tooling) |
| Activity logging | `ActivityLog.gs` | `admin-activity-dashboard.html` |
| Email delivery config/sending | `EmailService.gs` | `email-config.html` |
| Store distribution map | (data pulled from various sheets) | `store_map_v2.html` |
| AI prediction dashboard | (reads survey/work-order sheets) | `ai-prediction.html` |

`InspectVendor.gs` and the `Test*.gs` / `Debug*.gs` / `debug_*.gs` files are standalone diagnostic scripts, run manually from the Apps Script editor — not wired into `doGet`.

### Auth & roles
Auth is client-side and session-based: `index.html` stores the logged-in user in `localStorage` (key `AUTH_USER`) and calls `checkAuth()` synchronously in the **first** `<script>` block on page load. Any new global state that `checkAuth()` or early UI rendering depends on must be declared in that same first script block — later `<script>` blocks parse too late (see memory `feedback_index_html_script_order`).

Role flags come back from the server as `isAdmin`, `isSysAdmin`, `isSMF` on the user object and gate which tabs render (`ADMIN_ONLY_TABS` vs `GENERAL_USER_TABS` in `index.html`). Role hierarchy is non-obvious — `"admin"` is the top tier, not `isSysAdmin`, and the literal string `"Super Admin"` appears in sheet data and must map to `isAdmin` (see memory `feedback_admin_role_hierarchy`). Password hashing/reset flows live in `Code01.gs` (`hashPassword`, `adminResetPassword`, `requestPasswordReset`, `completePasswordReset`, `changePassword`).

For survey report edit permissions specifically, the pattern is `isAdmin || smfCanEdit` gated by a feature-flag-style toggle (e.g. `SMF_SURVEY_EDIT_ENABLED_V1`) — apply this pattern consistently across all survey report pages, not just whichever one prompted the change (see memory `feedback_survey_report_edit_permission_pattern`).

### Data layer conventions
- No ORM — every read/write goes through `SpreadsheetApp` (`getSheetByName`, `getDataRange`, `getValues`, `appendRow`, etc.) directly in the `.gs` files.
- Expensive full-sheet scans that are called on every page load (e.g. `getOrgChartData` in `Code01.gs`) are wrapped in a 60s `CacheService.getScriptCache()` cache — follow this pattern for new hot-path read functions on large sheets.
- Concurrent writes to the same sheet use `LockService.getScriptLock()` guards — required for any new function that writes to a shared sheet (surveys, work orders, trip plans, EDMI, capex, upload schedule all already do this).
- When adding a field to an existing record's edit path, it must appear in **both** the create/save function and the corresponding `get*RecordById()` read function — a field present in the sheet but missing from the "get record for editing" function will read back blank in the edit form and silently wipe the real value on save (see memory `feedback_survey_edit_data_loss_pattern`).
- Forms use `novalidate`, so HTML `required` attributes are not enforced by the browser — every mandatory field needs an explicit check in the JS submit handler, or invalid/empty submissions will reach the sheet (see memory `feedback_gas_novalidate_required`).

### Non-code assets
`Pyhon ANL/` and the top-level `.py`/`.xlsx` files are one-off data-analysis/migration scripts and source spreadsheets, not part of the deployed app (and excluded from `clasp push` via `skipSubdirectories`). `Service Account/` holds a GCP service-account key and is gitignored — never commit its contents.
