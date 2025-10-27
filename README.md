### Auction Portal — Dev Notes

#### Edge Functions: Deploy

Prereqs:
- Supabase CLI installed and logged in
- Project linked (run `supabase link` once in this folder)

Deploy all functions:

```bash
# From repo root (auction-portal)
cd supabase/functions
supabase functions deploy open_auction
supabase functions deploy pause_auction
supabase functions deploy resume_auction
supabase functions deploy close_auction
supabase functions deploy next_player
supabase functions deploy place_bid
supabase functions deploy sell_player
supabase functions deploy mark_unsold
supabase functions deploy undo_bid
supabase functions deploy undo_sold
supabase functions deploy undo_unsold
```

Notes:
- CORS is centralized in `_shared/cors.ts`. All functions already import it.
- If you change headers, redeploy the affected functions.

#### Verify CORS Preflight

Replace placeholders: `<PROJECT_REF>`, `<ANON_KEY>`, `<AUCTION_ID>`.

Preflight OPTIONS (expect HTTP 204 with CORS headers):

```bash
curl -i -X OPTIONS \
  https://<PROJECT_REF>.supabase.co/functions/v1/next_player \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, x-client-info, apikey, content-type"
```

POST (expect 200/400 JSON):

```bash
curl -i -X POST \
  https://<PROJECT_REF>.supabase.co/functions/v1/next_player \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"auction_id":"<AUCTION_ID>"}'
```

#### Console Queue Scopes

- **default (All)**: Ignores sets; selects next `auction_players.status = 'available'`.
- **set (By Set)**: Requires manual selection of a set in the Set dropdown, then click Apply. Server returns `400` if missing.
- **unsold (Unsold)**: Selects from `auction_players.status = 'unsold'`.

UI behavior:
- "Current Auction Set" badges mirror `auctions.queue_scope` and selected set after Apply.
- There is no “Default Set” convenience memory; auctioneer must select the set explicitly when using “By Set”.
- Typeahead search and Next Player honor the active scope. Empty results show a helpful message.

#### Local Dev

- Frontend: `cd web && npm run dev`
- Env: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `web/.env.local`.

#### Policy

- No keyboard shortcuts for actions; mouse-only for commands. 