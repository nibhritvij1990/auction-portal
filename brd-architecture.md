## BRD and Architecture v0.1

### Purpose
- Transform the static UI into a production-grade, multi-tenant player auction platform with real-time overlays and an operator console.

### Users and Roles
- **Auction Admin**: Configures organization, teams, players, rules.
- **Auctioneer**: Runs live auctions, triggers sold/unsold, manages flow.
- **Team Representative**: Bids for team, sees budget, receives outcomes.
- **Broadcaster/Producer**: Embeds overlays (OBS), read-only.
- **Viewer**: Public, read-only views.

### High-Level Features
- **Organization/Account model**: Multiple auctions per org.
- **Auction Setup**: Teams, players, sets, base prices, increment rules.
- **Live Console**: Select player, open bidding, accept bids, close sold/unsold.
- **Bidding**: Authenticated team bidding with constraints (budget, roster limits, increments).
- **Realtime Overlays**: Player, ticker, team grid, upcoming list; transparent backgrounds for broadcast.
- **Audit and Undo**: Event history and controlled rollback.
- **Reporting**: Post-auction summary, exports.

### MVP Acceptance (Must-Have)
- **Auth**: Email/password, org + role scoping.
- **CRUD**: Auctions, teams, players, rules.
- **Auction Engine**: Command handlers with validation and business rules.
- **Realtime**: WebSocket updates to console/overlays.
- **Overlays**: At least 2 wired to live state (player feature, ticker).
- **Audit**: Basic event log and last-event undo.
- **Environments**: Staging + production with observability.

### Non-Functional Requirements
- **Security**: RBAC, input validation, rate limiting, audit trails, secret management.
- **Scalability**: 100 orgs, 1k concurrent bidders; overlay refresh latency < 300ms P95.
- **Reliability**: 99.9% availability; idempotent mutations.
- **Compliance-ready** logging; minimal PII.
- **Performance**: Efficient DB queries and caching; realtime backpressure.

---

## Domain Model (ERD Summary)
- **Organization** (id, name)
- **User** (id, orgId, email, passwordHash)
- **RoleAssignment** (userId, orgId, role: Admin|Auctioneer|TeamRep|Viewer)
- **Auction** (id, orgId, name, status: Draft|Live|Paused|Completed, startsAt, endsAt, configId)
- **Team** (id, orgId, auctionId, name, purseTotal, purseRemaining, maxPlayers)
- **Player** (id, orgId, name, sport, position, basePrice, meta)
- **AuctionSet** (id, auctionId, name, order)
- **PlayerSet** (playerId, setId, order)
- **IncrementRule** (id, auctionId, threshold, increment)
- **Bid** (id, auctionId, teamId, playerId, amount, createdAt, byUserId)
- **AuctionEvent** (id, auctionId, type, payload, createdAt, version)
- **Assignment** (playerId, teamId, price, auctionId, createdAt)
- **OverlayConfig** (id, orgId, theme, options)
- **SessionToken/Device** (for websocket auth)
- **AuditLog** (id, orgId, actorId, action, entityRef, diff, ts)

### Invariants
- `purseRemaining >= 0`; `sum(Assignments.price) + purseRemaining = purseTotal`
- `maxPlayers` not exceeded per team
- `Bid.amount` respects `IncrementRule` based on current highest
- Player cannot be sold more than once per auction

---

## Architecture and Tech Stack

### Zero-Cost MVP Stack (Preferred for Launch)
- **Frontend/Overlays (hosting):** Netlify Free, deployed under existing site subpath `/auction-portal`.
- **Backend/Auth/DB/Realtime:** Supabase Free (Postgres + RLS, Auth, Realtime channels, Edge Functions) to minimize costs and complexity.
- **CI/CD:** GitHub Actions (free), Netlify deployments on PRs/main.
- **Monitoring:** Sentry (free dev plan) + provider logs.

### Frontend (Scale Path)
- **Framework**: Next.js (App Router) + Tailwind; convert existing HTML into React components.
- **State**: React Query for server cache; Zod for schema validation.
- **Auth**: NextAuth (email/password initially; SSO later).

### Backend (Scale Path)
- **Runtime/Framework**: Node.js + NestJS (TypeScript) when leaving Supabase Edge Functions.
- **API**: REST with OpenAPI; webhooks. GraphQL optional later.
- **Realtime**: Socket.IO channels per auction (or stay with Supabase Realtime until scale requires migration).
- **Persistence**: PostgreSQL with org-level RLS.
- **Caching/Streams**: Redis (later) for ephemeral state and pub/sub to overlays.

### Infrastructure (Scale Path)
- **Deploy**: Vercel (frontend) + AWS (backend) or Fly.io/Render. Enterprise: AWS ECS/EKS, ALB, RDS, ElastiCache.
- **IaC**: Terraform.
- **Observability**: OpenTelemetry, Prometheus/Grafana, Sentry, CloudWatch.

### Event Model (Command/Event Sourcing)
- **Commands**: `openBidding`, `placeBid`, `retractBid`, `sell`, `markUnsold`, `pause`, `resume`.
- **Events**: `BiddingOpened`, `BidPlaced`, `BidOutbid`, `BidRejected`, `PlayerSold`, `PlayerUnsold`, `AuctionPaused`, `AuctionResumed`.
- **Read Models**: Postgres projections/materialized views; Redis cache for overlays (or Supabase Realtime subscriptions in MVP).

---

## Phased Delivery Plan (MVP ~8–10 Weeks)

### Phase 0: Foundations (1 week)
- Monorepo (pnpm, turborepo), shared types, lint/test, ADR templates.
- Auth scaffolding (NextAuth, JWT) or Supabase Auth wiring.
- DB migrations with Prisma or SQL migrations in Supabase.

### Phase 1: Core CRUD (1.5 weeks)
- Orgs/users/roles.
- Auctions, teams, players, sets, increment rules.
- Admin UI for management flows.

### Phase 2: Auction Engine (2 weeks)
- Command handlers and business rules.
- Event store + projections to Postgres.
- REST endpoints/Edge Functions; realtime channels for updates.

### Phase 3: Console + Bidding (1.5 weeks)
- Auctioneer console wired to commands.
- Team bid client with budget/increment guardrails.
- Undo last action.

### Phase 4: Overlays (1 week)
- Convert `overlay-player.html` and `overlay-ticker.html` to app pages.
- Subscribe overlays to realtime channels keyed by `auctionId`.
- Query param scoping and theme configuration.

### Phase 5: Observability/Security/Perf (1 week)
- Tracing, logs, SLOs; rate limiting, input sanitation.
- Load test 1k concurrent bidders; P95 overlay update < 300ms.

### Phase 6: Packaging/Deploy (1 week)
- Staging + production; runbooks; rollback; automated backups.
- Reporting and CSV export.

---

## Governance and Quality
- ADRs for major decisions; CODEOWNERS; PR templates.
- Testing pyramid: unit (Jest), integration (Prisma/Supabase test DB), e2e (Playwright).
- Schema-first API (OpenAPI) and Zod validation at client/server boundaries.
- Feature flags for risky changes.

## Risks and Mitigations
- **Realtime complexity**: Start with Supabase Realtime; consider Socket.IO/Redis at scale.
- **Data consistency**: Event-sourced core + projections; idempotent handlers.
- **OBS compatibility**: Maintain transparent backgrounds; throttle re-renders; strict CORS.

## Next Steps
- Initialize Netlify + Supabase projects; wire environment variables.
- Build a vertical slice: convert `overlay-player` end-to-end to live state under `/auction-portal`. 