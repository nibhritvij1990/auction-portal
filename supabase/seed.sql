-- Seed demo data (runs with service role in Supabase SQL Editor)

with org as (
  insert into public.organizations (name)
  values ('Demo Org')
  returning id as org_id
), auction as (
  insert into public.auctions (org_id, name, status)
  select org_id, 'Demo Auction', 'draft' from org
  returning id as auction_id, org_id
), t1 as (
  insert into public.teams (org_id, auction_id, name, purse_total, purse_remaining, max_players)
  select org_id, auction_id, 'Team Alpha', 100000000, 100000000, 25 from auction
  returning id as team_id, auction_id, org_id
), t2 as (
  insert into public.teams (org_id, auction_id, name, purse_total, purse_remaining, max_players)
  select org_id, auction_id, 'Team Beta', 100000000, 100000000, 25 from auction
  returning id as team_id, auction_id, org_id
), players as (
  insert into public.players (org_id, name, sport, position, base_price)
  select org_id, 'Player One', 'Football', 'Forward', 5000000 from auction
  union all
  select org_id, 'Player Two', 'Football', 'Midfielder', 4000000 from auction
  returning id
)
insert into public.increment_rules (auction_id, threshold, increment)
select a.auction_id, x.threshold, x.increment
from auction a cross join (values
  (1000000, 10000),
  (5000000, 50000),
  (10000000, 100000)
) as x(threshold, increment);

-- NOTE: After creating your first auth user, link it to the org with:
-- insert into public.profiles (id, org_id, role) values ('<AUTH_USER_ID>', '<ORG_ID>', 'admin'); 