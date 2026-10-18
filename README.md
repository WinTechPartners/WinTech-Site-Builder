# WinTech Preview Studio

A Node 24 application that takes a public company URL through public research, sourced company-voice extraction, distinctive website generation, automatic factual and browser checks, WinTech scoring, and bounded repairs. No person approves intermediate steps.

## Start

Run `start.ps1`, or run `npm ci` and `npm start` in this folder. The management app is at **http://localhost:4173** and previews use the separate origin **http://localhost:4174**. Chrome or Edge is detected automatically on Windows.

An ignored `.env` belongs in this project folder. Add `OPENROUTER_API_KEY` there, or use the app's Connection & setup panel. The panel can save the key to this project's ignored `.env` when you select that option. Keys never appear in previews or API responses. When the key field is empty, the app can still research queued companies; generation resumes automatically when a key is added to `.env` or through Setup. Do not paste keys into chat.

Paste one URL, or use Add multiple URLs for up to 100. Jobs run serially in the background. They and their cost ledgers survive restarts. Existing company domains, including www/path variants, resolve to the same prospect job and budget. A failed job can be retried within its remaining allowance.

## Models and the $0.50 cap

The initial pool is configured in `BUILD_MODELS_JSON` in `.env`, not hard-coded in the backend or interface. Edit the IDs, display names and input/output price ceilings there, set `COPY_AUDIT_MODEL` to a member of that pool, and restart the app. The interface and rotation use the configured pool. The initial settings are:

- `xiaomi/mimo-v2.6-pro` — input ceiling $0.50/M, output ceiling $0.95/M.
- `z-ai/glm-5.3-flash` — input ceiling $0.20/M, output ceiling $0.70/M.
- `deepseek/deepseek-v4.1-flash` — input ceiling $0.35/M, output ceiling $1.25/M.
- `anthropic/claude-haiku-5.5` — input ceiling $0.12/M, output ceiling $0.60/M.

These are request-level maximum acceptable provider rates, not a promise that a provider at that price will always be available. Requests with no eligible provider fail rather than becoming more expensive. New prospects consume a shuffled four-model bag; the selected builder also leads company extraction. The configured COPY_AUDIT_MODEL independently checks final copy. BUILD_MAX_ATTEMPTS defaults to six bounded attempts; all attempts share the prospect cap. There is no premium-model fallback.

The SQLite ledger reserves a conservative maximum before every inference request: UTF-8 prompt bytes plus 8,192 framing tokens, priced at the input ceiling, plus the requested maximum completion priced at the output ceiling. Research, direction, generation and copy calls use text. Visual review adds up to three bounded low-detail JPEG screenshots, with another 4,096 input tokens reserved per image. No calls use tools, paid search or plugins. OpenRouter provider price constraints, zero per-request fee, parameter support, output limit and disabled provider fallback accompany every request. Prompts plus completions are kept below 95,000 tokens on this conservative calculation to avoid expensive long-context tiers.

The model allowance is **500,000 microdollars per company ($0.50)**. Reservations are atomic. Explicit provider-reported total costs settle them downward; missing billing information, failed requests, timeouts and interruptions retain the full reservation. Retries share the ledger. A reported charge above the reserved maximum records the anomaly and stops the job. This is application-side control based on OpenRouter honoring its documented pricing/output constraints; third-party billing itself cannot be controlled by local code. Account fees, hosting and any separately purchased services are outside this inference cap. Configured Runware artwork shares the same prospect ledger. The app does not use paid enrichment.

## Research and source boundaries

The crawler reads the homepage and at most eight selected company pages; linked public social profiles and up to two discovered profiles require an official link or exact company-domain backlink. Public Bing/Google results are discovery leads, never factual proof. Login gates, blocked searches and missing pages remain explicit coverage gaps. No credentials are used to bypass a platform's access restrictions. Source excerpts and exact supporting quotations remain with each job. At least three verifiable source passages are required.

Source images are downloaded with network/address checks and converted to smaller WebP assets when the browser is available. Original company photography remains separate from clearly conceptual generated artwork; no fabricated evidence or badges are added. All downloaded assets originate from public company pages; customer approval/licensing still belongs in the later paid production process.

## WinTech integration and first-pass requirements

Each model entry also has a `reasoning` setting. The supplied configuration disables reasoning for optional-reasoning builders and retains low reasoning for the mandatory-reasoning model. Responses stream with final usage reporting, avoiding long silent-response header timeouts. `BUILD_MAX_TOKENS` and `MODEL_TIMEOUT_MS` are configurable in `.env`; their reservations still fall under the immutable $0.50 per-company cap.

`vendor/scanner/scanner.cjs` is copied from the user's WinTech-Site-Scanner. Analytics is excluded from the raw overall score. Applicable local readiness is reported separately from pending HTTPS/Lighthouse measurements. The only adaptations are the CommonJS `.cjs` render import and exporting its existing HTML-signal extractor. `render.cjs` is the original renderer. Upstream scanner SHA-256 at import: `36AC63671073D45A5767BEC55CE40166E2537D497EA6BE950184A24502B808B9`.

Generation includes static HTML, metadata, one H1, ordered headings, semantic landmarks, sourced organization and visible FAQ schema, meaningful internal links, contact details when verified, image descriptions/dimensions and responsive CSS. Hosting supplies security headers, robots.txt, sitemap.xml, llms.txt and security.txt. Previews have five pages: home, services, about, and operator-specific preview privacy and terms pages. The latter do not pretend to be approved customer legal policies.

Checks run before any link is marked ready:

- All three business pages pass native HTML checks and desktop/mobile rendering at 1440px and 390px.
- No horizontal overflow, broken images, missing anchors, unlabelled forms or detected low solid-background text contrast. Gradient backgrounds need Lighthouse for broader validation.
- Applicable local readiness >=80, with hard failures for broken HTML, links, images and measured readability. No word-count, HowTo, demo-form, tracking or translation quota.
- Independent copy check flags no unsupported claims or material voice departures.
- CSS-token similarity to earlier successful previews <=0.90. This is a cheap similarity heuristic, not a guarantee of visual originality.
- External WinTech scans are explicitly separate from free local repair cycles. Their accepted overall pass mark is 80.

The first build's score is saved separately from repaired results. Privacy, analytics and language scores are reported honestly: no fake translations, unnecessary pixels, sham consent or irrelevant HowTo schema is inserted to inflate them. The scanner rewards these optional features, so not every legitimate preview can reach 95 overall.

Local mode cannot verify public TLS or Google PageSpeed. It uses the real scoring function with unverified TLS explicitly false and PageSpeed unavailable, labels its score **provisional**, and can produce a local preview after the other checks pass. A provisional preview is never presented as a verified full scan. On HTTPS, missing required external measurements also remain provisional. Public origin-wide robots/sitemap/llms files describe the preview service and do not enumerate secret preview URLs. Each preview also has its own sitemap and llms.txt. `noindex` and crawler blocking are intentional for unapproved concepts.

The scanner's old `run_local_scan.js` helper is deliberately not used: it has a hard-coded output path into another project.

## Isolation and storage

Management endpoints require a server token. Local mode bootstraps its token only for loopback-host requests; remote mode requires `ADMIN_TOKEN` and a sign-in. Generated sites run on a separate port/origin, have no model-authored JavaScript, cannot post forms or connect to remote services under their CSP, and have no access to the management API. Demonstration forms show an explicit no-submission message. Generated assets and pages use unguessable capability links; they are unlisted, not password-authenticated client portals.

Crawler HTTP(S) requests reject private/reserved networks, credentials and nonstandard ports, check each redirect, pin DNS results into the socket lookup, and bound bytes/time. No remote scripts execute during research. Store `.data` on a persistent volume; it contains SQLite, source excerpts, attempts, pages and screenshots. Do not commit `.data`, `.env` or logs.

## Public hosting

This application requires Node and a browser; it cannot run its native scanner inside the Sites Cloudflare Worker runtime. A Dockerfile is included for a Node host such as Railway. Use a persistent `/data` volume, a strong `ADMIN_TOKEN`, `HOST=0.0.0.0`, and separate public origins for the management and preview ports. Set `PREVIEW_ORIGIN` to the preview HTTPS origin before generating prospect links. Never put management and previews on the same origin. A reverse proxy must keep these origins separate and forward the configured ports. No public deployment is claimed by the local build.

## Verification

`npm test` exercises transaction boundaries, uncertain billing, pricing controls, private-URL rejection, source verification, sanitization and a complete synthetic URL-to-preview flow using a real browser and native scanner. Model HTTP responses and source content in that end-to-end test are fixtures, not live OpenRouter results. `npm run check` checks server/frontend syntax. A paid live run additionally needs the user's actual OpenRouter key.

## Premium design gate
Every new build creates a company-specific art direction before generating HTML/CSS. After scanner and factual checks pass, the configured DESIGN_AUDIT_MODEL reviews real desktop hero, desktop continuation and mobile screenshots. All five visual dimensions must be at least 8/10, average at least 8.5/10, with no material issues. Failed reviews become automatic repair instructions; they never bypass scanner or factual checks. This is an automated subjective assessment, not a guarantee of commercial performance. Art direction and screenshot reviews use the original prospect ledger and 50-cent cap. Models remain environment-configured. Vision inputs are bounded low-detail JPEGs and include extra conservative token reservation; Runware image generation, when enabled, shares the same cumulative ledger.






## Runware hero images
Set RUNWARE_ENABLED=true, RUNWARE_API_KEY and the exact RUNWARE_MODEL_ID in .env. No provider or model substitution occurs. The generator creates a company-specific conceptual raster hero and uses that local image in the website; it never presents generated people or facilities as company evidence. RUNWARE_IMAGE_PARAMS_JSON controls dimensions and steps, capped at one 1.5MP image, at most 16 steps and no paid add-ons. RUNWARE_IMAGE_MAX_USD is the conservative reservation taken from the same $0.50 ledger before submission. Actual reported image cost settles it; missing cost retains the reservation. Compute-based provider billing is not a native hard-price guarantee; a charge above the reservation stops further spending. Persisted task UUIDs recover uncertain jobs by polling rather than resubmitting paid work. Completed images are reused across repairs. The saved key is read without a restart; waiting builds resume automatically when it is present.

## Combined studio workflow
The creative brief combines visitor journey, exact hero copy and imagery direction, design tokens, typography, responsive composition and restrained motion in one bounded planning call. Builds use local licensed Manrope and Space Grotesk fonts. Refinement reads the generated CSS and all three pages plus actual screenshot findings, preserves working factual content, and records impact-ranked change notes. Every candidate and its scan/audit/review remains as a snapshot. Stop aborts upstream model and image requests; interrupted charges remain reserved and the same Runware UUID is reused on retry. Default prospect allowance remains $0.50. An explicitly authorized per-job allowance may be increased to $0.90 without deleting earlier charges; no API endpoint silently raises it.

## Screenshot-aware repair and spending guard

Visual repairs use the environment-configured, vision-capable DESIGN_REPAIR_MODEL (defaults to DESIGN_AUDIT_MODEL). The builder sees the actual desktop, continuation and mobile screenshots as well as measured element positions, dimensions and grid rules. Repeated low scores trigger structural repair rather than cosmetic changes; two three-review cycles without meaningful improvement stop paid generation and retain research, images, ledger and candidates. The visual gate is never lowered to force success. Scanner/factual-only fixes remain targeted text/code patches. All future URL jobs use these shared rules.

DESIGN_REPAIR_MODELS_JSON optionally defines an ordered vision-capable subset of the same affordable build pool. Failed visual repairs rotate through it. A concept still below 7.5 after a stalled cycle gets one journaled creative reset and, when enabled, one new image using the exact configured Runware model. The previous image task and every charge remain in history; uncertain tasks are polled, never resubmitted. Further stalls stop automatically.

Production creative briefs and refinements request strict JSON schemas, with schema input included in budget reservations. A single fenced JSON result can be recovered from provider commentary; incomplete planning output is retained for a bounded completion fallback. The renderer preserves authored type sizes and checks actual body-text readability instead of flattening all paragraphs to 16px. Visual repair context includes the original uncropped hero artwork alongside the three rendered views and measured geometry, so crop errors can be repaired without another image purchase.

If the new concept still stalls, one scoped homepage reconstruction discards the failed markup and layout while reusing the verified profile, inner-page content, metadata and paid artwork. DESIGN_RECONSTRUCTION_MODEL controls this bounded fallback, and all its costs remain on the original ledger. It does not lower the quality threshold. CSS-only repairs reuse an independent factual audit only when content, profile, evidence and assets hash identically.

## First-build visual context and font integrity
The initial builder now sees the exact generated hero artwork before writing code. When a verified craft benchmark is installed in public/design-reference, it also receives desktop/continuation reference images with explicit instructions to use the prospect’s own identity, composition, copy and artwork. These are craft references, not HTML templates. Body/source claims still pass independent verification. Visual review distinguishes the three actual viewports from the fourth raw artwork image and receives measured layout geometry. DESIGN_REVIEW_MAX_TOKENS is configurable and reserves the same cumulative budget.

Only correctly encoded variable Manrope/Space Grotesk WOFF2 files are accepted at startup; model font-face declarations are removed. Instrument Serif italic is an optional self-hosted 400-weight accent. Repairs append small CSS overrides instead of replacing working styles. Empty optional CSS cannot erase a design. Measured small-text and solid-background contrast issues can be corrected locally without another model call. Preview form buttons invoke the explicit no-submission flow, and favicons use each prospect’s initial.

## Independent visual consensus
DESIGN_REVIEW_MODELS_JSON can select a fixed panel from the same configured affordable pool. Each model gets one independent assessment of the same labeled evidence. A strict majority (at least two models) must individually pass the unchanged average >=8.5, every dimension >=8, no-material-issues bar. No valid low assessment is resampled. All votes, dissent and provider failures are retained and shown in management. The consensus score averages the agreeing premium assessments, with the agreement count displayed; scanner and factual gates remain mandatory. Reviewer calls run sequentially so temporary reservations do not crowd out the remaining budget. Rate-limited providers cool down before another paid request; a configured fallback is used only when a single-reviewer assessment is unavailable, never to override a valid low score.


Premium workflow verification: all prospect pages are checked at 390, 768 and 1440px. Source-preserving CSS repairs reuse the exact cached factual audit; changed text invalidates it. Provider cooldowns happen before reservations, with one configured fallback for transient art-direction/copy-audit failures. Failed quality reviews remain failures and are never replaced by retries of an unchanged candidate. Default prospect cap remains $0.50; explicitly authorized job allowances can reach $0.90, retaining all prior uncertain charges. No quality guarantee or public performance score is implied by local preview checks.

## Automatic public previews

The existing WinTech website serves /ws/<stable-partner-name> and /ws/list. The list contains partner, city, state, current URL and new URL. Names are persisted and collision-safe; unavailable source-backed locations remain blank. Preview pages are public but noindexed. Only rendered pages, local images, licensed fonts, public directory metadata and the no-submission form controller are exported; credentials, model logs and management endpoints stay local.

Set PUBLIC_SITE_ORIGIN, PUBLIC_SITE_CHECKOUT (the existing website checkout), PUBLIC_RAILWAY_SCRIPT (the authenticated Railway CLI JavaScript entry), the explicit project/service/environment IDs and PUBLIC_PUBLISH_ENABLED=true. The website app requires serve-handler 6.1.7. The exporter installs hosting/static-server.mjs as app/server.mjs and changes its start script, retaining the existing main-site SPA fallback outside /ws.

The publisher checks every 30 seconds while the builder runs. It publishes completed prospects only after browser/scanner, factual and unchanged premium visual gates pass. Static uploads do not call paid models. Catalog hashes prevent duplicate unchanged uploads; persisted upload state verifies the live version after restart before retrying. Failed uploads use bounded exponential backoff and retain the checked preview. The authenticated /api/publication endpoint reports state/errors. Generation budgets and previous charges are unchanged. The local builder must remain running and Railway authentication/hosting must remain available.

An operator can explicitly export a source/browser-checked draft using stagePublicCatalog({publishJob,draft:true}); this is visibly labeled and never changes failed visual scores or prospect readiness. This option is not used by automatic completion. ProMAS is currently such a draft.

## Bounded premium-repair evidence
Rendered reviews request complete structured scores without changing the 8.5/no-dimension-below-8 gate or independent majority. Lossless source screenshots are encoded adaptively within the existing 30,000-character JPEG bound before any model call. Review geometry includes header bounds and actual intrinsic/fitted image dimensions, to distinguish real cropping from artwork negative space. Repair prompts bound real viewport geometry as well as CSS; numbered visual findings stay homepage-scoped. Styled semantic wrappers survive child-content replacement patches when the returned CSS still targets those wrappers. Existing negative assessments and every prior charge remain retained. Reconstruction uses the environment-configured approved pool model and reuses the paid hero; no model or image cost cap is raised.

Vendor and useful-content preservation
- Research retains source image labels, verified vendor/category/logo records, and page outlines outside the short fact brief.
- Generators must preserve source-listed vendors, services and industries. Vendor restoration runs before checks and candidate caching, with source logos reserved separately from the five-photo budget.
- Each service needs problem context, a source-supported offering, buyer questions/preparation and a relevant next step. Each industry needs distinct practical guidance. Neutral planning advice must remain separate from company promises.
- Independent copy review returns required contentIssues alongside factual and voice findings. Missing or shallow coverage blocks completion and automatic publication even if visual and scanner scores pass.
- Copy cache contentContract 2 prevents old factual-only approvals bypassing the new content review. No additional paid review stage is introduced.

Required preservation contract, version 3
- Fresh research stores verifiable services, industries, vendor identities/categories/logos, original logo evidence and source outlines independently of the abbreviated fact list.
- The company brief must return source-quoted service, industry and vendor inventories. Source discovery also extracts labelled service and industry sections directly.
- The renderer keeps the original logo in each header and restores missing verified vendors. Source vendor logos have download slots separate from the photography allowance.
- Coverage checks compare visible rendered content to source inventories. Missing original identity or named offerings requests automatic repair.
- The existing independent copy review must assess each service and industry, citing real explanation, buyer-preparation and next-action wording from its detail page. Generic filler, invented evidence and contact prose without a usable action fail.
- The publication gate requires the current coverage contract and passed usefulness review as well as browser, factual and visual checks. Old approvals cannot satisfy this contract. Research version 4 renders required inner company pages as well as the homepage and refreshes older research while retaining paid assets and cumulative costs.
- Automated repair remains inside the existing per-prospect ledger. If a site cannot satisfy the checks within its budget, it stops with the last published preview intact rather than releasing an incomplete replacement.

ProMAS source-completeness correction: current checked preview retains 15 source-listed service/product labels in 14 detailed chapters (surveillance labels share one substantive chapter), four industry groups and nine featured vendors. Eight vendor logos were available from source; HP is retained as text. The original company logo is present on each generated main page.
Reviewer extraction decodes visible HTML and excludes hidden content. Candidate-page schemas restrict citations to the real three page slugs. A contradictory report marking every entry useful can receive one bounded finding-verification call, preserving its original findings and every confirmed blocker. Missing coverage or a negative per-offering grade cannot be cleared by this path. All calls stay in the original per-prospect ledger.

ProMAS fix propagation audit
- Source research prioritizes service, solution, industry, vendor, product and About pages and renders client-loaded inner pages. Unread essential sources stop before model or image generation; navigation and footer text alone cannot stand in for page content.
- First-build page space now scales with the actual offering inventory. The old 300-450-word total services-page limit is removed. The plan explicitly preserves vendor/product context, differentiated industry guidance, company voice, history, values, giving and procurement detail from source evidence.
- Known browser defects and missing coverage are repaired before buying a factual/usefulness audit. Missing original-logo downloads stop before paid design work.
- Native checks measure phone/tablet text gutters and apply free responsive corrections. Refinement clears obsolete selector-based corrections; visual-cache fingerprints include gutter corrections.
- Exact paid model responses are indexed by prospect, configured model/reasoning, purpose, complete inputs, output limit and response schema. Successful settled responses can be replayed after process restart without a new request or reservation. Changed inputs invalidate this cache; uncertain charges remain reserved.
- A report citing only nonexistent generated wording can use the configured fallback once; real factual rejections remain failures. Existing bounded consistency verification keeps raw contradictory reports and every confirmed blocker.
- Verified location supporting quotes survive revalidation, preserving partner-list locations.
- Activation verification: 80 full offline regression tests passed, plus targeted reviewer-recovery and pre-review omission tests. Runtime health confirms automatic WWW publishing is enabled and the default prospect cap remains $0.50. Existing ProMAS total remains $0.837811; this propagation audit made no live model or image calls.

## Railway deployment and migration

The Docker service runs Node 24 and Linux Chromium, with `/data` on a persistent volume. GitHub contains code, tests and licensed fonts only; `.env`, SQLite, paid responses and prospect assets are excluded. The protected one-time migration endpoint accepts a path-checked archive only into an empty store, then restarts. Its authenticated manifest compares all prospect budgets, call totals and SHA-256 hashes of paid responses. Disable `MIGRATION_IMPORT_ENABLED` after import.

`MODEL_CALLS_ENABLED=false` blocks new provider requests before reservations while permitting exact cached response replay. `WORKER_ENABLED=false` pauses processing during migration. Credentials and model IDs are configured in Railway variables. Browser verification loads byte-verified served HTML and local assets into Chromium with bounded waits, measures 390/768/1440px, and runs no external scan or model request. `/api/jobs/:id/verify` verifies saved pages for free.

The main website gateway can forward only public `/ws/` GET/HEAD routes using `PUBLIC_PREVIEW_UPSTREAM`. Public previews and their list can update directly from the persistent store without rebuilding the main website. Automatic publication retains source/content/design gates. An explicitly user-selected draft may be published after browser checks and raw scanner >=80 using a fingerprint tied to the exact saved HTML; this does not mark missing model reviews as passed.
