## Next Steps and Action Plan

### Immediate (next 1–2 days)
- Summary page polish (public page)
  - Right-align and finalize header layout across viewports
  - Sticky headers for Team Purses and Player Pool Status tables
  - Persist sort and filters (URL params + localStorage)
  - Add empty/loading states and skeletons
  - Drill-down anchors from KPI cards to relevant sections with pre-applied filters
- Console UI refinements
  - Finalize bidding buttons (icons, spacing, legibility in compact mode)
  - Ensure Next Player, Set scope, and search UX states are consistent
  - Harden realtime subscriptions and cleanup on unmount
- Uploads
  - Unify per-page image upload logic into a reusable `ImageUploader` component
  - Migrate auctions/teams/players/sponsors pages to use the component
- Auth and route guards
  - Double-check public Summary has no auth chrome
  - Verify admin/auctioneer RBAC in manage pages

### Short-term (3–7 days)
- Edge Functions (robustness)
  - Add input validation, idempotency keys, and rate limits
  - Standardize CORS responses and error payloads
  - Structured event payloads and versioning for auditability
- Realtime & projections
  - Confirm all entities publish to realtime channels used by Console/Summary
  - Evaluate materialized views refresh cadence; add triggers if needed
- Players management
  - Improve bulk import/export (CSV + JSON); validation with per-row error report
  - Add client-side virtualization for large lists
  - Enhance filters (multi-select category; set; status)
- Sponsors
  - Sort by priority; ensure title sponsor badge in all relevant views
- Accessibility
  - Keyboard focus states, aria-labels, and color-contrast checks (dark/light)

### Medium-term (1–3 weeks)
- Event sourcing completeness
  - Ensure every console action emits a canonical event
  - Create “read models” for snapshot views (team aggregates, queue, summary)
  - Backfill repair scripts (rebuild projections from event log)
- Performance & DX
  - DB indexes: verify high-cardinality filters (auction_id, status, set_id)
  - Use Supabase image transforms for thumbnails to reduce payloads
  - Add code-splitting and React performance audits (memoization)
- Testing
  - Unit tests: helpers (bidding increments; eligibility; upload utils)
  - Integration tests: Edge Functions (Deno) and RLS access paths
  - E2E tests: Playwright flows (auth, manage pages, console actions)
- Observability
  - Sentry (frontend + edge functions), Supabase logs dashboards
  - Slow query logs and EXPLAIN ANALYZE on heavy reads

### Longer-term (3–6 weeks)
- Roles & organizations
  - Organization-scoped RBAC (admin, auctioneer, analyst, viewer)
  - Admin UI to manage org users/roles
- Multi-auction support improvements
  - Cross-auction dashboards; cloning auctions; templates for increment rules
- Public overlays
  - Build read-only overlays for stream (ticker, team rosters, live bids)
  - Themeable styles and URL parameters for broadcast tooling

### Security & Data
- RLS audit
  - Verify policies on all tables (read/write by org, minimum privilege)
  - Test negative cases: cross-org access attempts, unauthenticated writes
- Storage
  - Enforce prefix convention: `${orgId}/${auctionId}/${entity}/${id}/...`
  - Orphan sweeper: scheduled function to clean unused images> N days
- Backups & migrations
  - Seed data profiles; roll-forward/rollback scripts
  - Periodic backups; disaster recovery drill checklist

### Component/Code Refactors
- Create `ImageUploader` component
  - Props: `bucket`, `prefix`, `value`, `onChange`, `shape`, `aspect`
  - Drag&drop, progress, preview, resize/compress (512px), replace+delete old
- Extract bidding/increment utilities
  - `computeNextBidAmount(currentBid, base, incRules)`
  - `computeMaxAllowed(purseRemaining, base, maxPlayers, acquired)`
- Table toolkit
  - Sticky header, sort icons, debounce, URL state sync

### Deployment & DevOps
- Netlify
  - Environment variables for Supabase URL & anon key
  - Preview deploys from PRs; protect main
- Supabase
  - Edge Functions CI deploy script; env for service role key
  - Migrate scripts tracked in repo; `supabase/migrations/*`

### Risks & Mitigations
- Realtime noise: throttle UI updates, batch changes, debounce redraw
- Large data sets: add virtualization and server-side pagination
- Image storage growth: enforce resize/compression and sweeping
- Event consistency: idempotent commands; well-defined state transitions

### Acceptance Criteria (selected)
- Summary page: public access, no auth UI; real-time updates; sticky headers; sorted/filtered state persists on reload
- Console: bid buttons show Next/Acq/Purse/Max correctly per team; no layout shifts; realtime stays in sync
- Uploads: drag&drop with progress; client preview; image resized; old file deleted on replace
- Edge Functions: all commands validated, rate limited, and return consistent JSON
- RLS: all reads/writes constrained by org; negative tests pass

### Work Breakdown (proposed)
- Summary polish: 1–2d
- Console polish: 1–2d
- ImageUploader refactor + rollout: 1–2d
- Edge Functions hardening: 2–3d
- Tests (unit/integration/E2E): 3–5d
- Observability (Sentry/logs): 0.5–1d
- RLS audit + fixes: 1–2d

### Notes
- No keyboard shortcuts for actions as requested (typing only)
- Respect existing visual style from HTML mocks across all new pages 