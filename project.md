# Auction Portal: Static Front-End Prototype

## Overview

A static front-end prototype for a sports player auction system with accompanying broadcast overlays.

### Purpose

- **Admin/management UIs:** Manage teams, players, and bid rules.
- **Auction console:** Run a live auction.
- **Summary/dashboard views:** Overview of auction status and results.
- **Stream overlays:** Player card, players list, team grid, and ticker overlays designed for transparent backgrounds and OBS-style embedding.

**Scope:**  
This is a visual/UI-first prototype. All content is static placeholders with minimal interactivity for view switching. There is no backend or real-time data.

---

## Tech Stack & Design System

- **Stack:** Static HTML + Tailwind CSS (via CDN), Google Fonts, Material Symbols.
- **Interactivity:** One page uses Alpine.js for a simple dropdown.
- **Styling:** Consistent brand accents using CSS variables:
  - Console/Dashboard/Summary: `--ucl-pink`, `--ucl-purple`
  - Overlays: `--pink-accent`, `--purple-accent`
- **UX Patterns:** Card-based layouts, tables, light shadows, rounded corners, prominent headings. Overlays use transparent body backgrounds for compositing in broadcasts.

---

## Pages & Features

### `login.html`
- Poppins font, branded card over a background image.
- Email/password fields, Login/Sign Up buttons, “Forgot password” link.
- No form handling/auth wiring yet.

### `dashboard.html` (“Auction Central”)
- Top bar with logo, notifications, and user avatar dropdown (Alpine.js v2).
- Primary CTA: “Create New Auction”.
- Main content: Auction list table (name, status, date, teams, base price, total purse, max players/team) with action link stubs.
- Static content; links are placeholder anchors.

### `console.html` (“Player Auction” Live Console)
- Header with brand, nav stubs, user identity block.
- Live Auction card featuring a highlighted player with image, summary, and current set.
- **Right column:**
  - Current Bid and Highest Bidder cards
  - Bidding Actions (preset team buttons)
  - Auctioneer Controls (Sold, Unsold, Undo Bid)
  - Player & Set Selection (dropdowns, search, “Next Player (Random)”)
- All controls are UI-only; no event wiring.

### `manage.html` (“Auction Management Console”)
- Sidebar navigation (Teams, Players, Bid Rules) with active state styling.
- Simple JS toggles sections based on hash or click.
- Teams grid: logo, player count, balance purse, Edit/Delete buttons.
- Players table: avatar, club, category, set, base price, status, actions.
- Bid Rules: increment tiers with edit/delete controls and a “New Rule” form (no submit handler).
- Only page with custom JS (view switching).

### `summary.html` (Auction Summary)
- Current auction snapshot (player, bid, highest bidder).
- Team Purses table.
- Team Compositions (3 teams with player roles).
- Player Pool Status with static “tabs” (Available/Sold/Unsold) and a table.
- Static content; tabs are visual only.

---

## Overlays (Broadcast-Ready, Transparent Backgrounds)

- **`overlay-player.html`:** Single player feature card with photo, position, current bidding status, highest bid, and a small stat panel. Animated gradient text and accent icons for visual pop.
- **`overlay-players-list.html`:** “Upcoming Players” compact table overlay with initials avatar chips, designed to sit atop broadcasts.
- **`overlay-teams.html`:** 2x2 grid of team cards (logo, team name, remaining purse, composition). Now with unique teams and purse/player data.
- **`overlay-ticker.html`:** Horizontal marquee ticker of transfers/acquisitions with amounts, intended to loop seamlessly for on-air usage.

---

## How These Pieces Fit Together

- **Management UIs** (`manage.html`, `dashboard.html`): For configuring auctions, teams, players, and increments.
- **Live Auction Console** (`console.html`): Control surface for an auctioneer to display and move the auction forward.
- **Overlays** (`overlay-*.html`): Intended for broadcast/OBS embedding; visualize live state (current player, ticker, teams, upcoming players).
- **Summary** (`summary.html`): Presents at-a-glance status and would reflect outcomes if wired to real data.

---

## MVP Implementation (Zero-Cost Stack)

- **Frontend/Overlays (hosting):** Netlify Free. Deploy under your existing site at subpath `/auction-portal`.
- **Backend/Auth/DB/Realtime:** Supabase Free (Postgres + RLS, Auth, Realtime channels, Edge Functions).
- **CI/CD:** GitHub Actions (free).
- **Monitoring:** Sentry (free dev plan) + Netlify/Supabase logs.

### Minimal Vertical Slice
- Convert one overlay (`overlay-player.html`) to subscribe to Supabase Realtime (`auctionId` channel) and render current player + highest bid.
- Publish auction events via Supabase Edge Functions (e.g., `placeBid`, `sell`, `unsold`).
- Store state in Postgres tables with policies by `orgId`.

### Deployment Integration
- Netlify: configure site to serve the app under `/auction-portal`.
- Add environment variables for Supabase URL/anon key.
- Ensure overlays keep transparent backgrounds and cache-bust appropriately.

### Path to Scale (Later)
- Move complex business logic to a dedicated service (NestJS) when needed.
- Add Redis and more robust observability when traffic grows.
- Keep overlays reading from realtime channels for minimal latency.