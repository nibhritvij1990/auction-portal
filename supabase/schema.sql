-- Extensions (Supabase usually has pgcrypto enabled; keep for gen_random_uuid)
create extension if not exists "pgcrypto";

-- fn_current_org_id will be defined after profiles table is created

-- Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles map auth.users -> organizations and roles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete restrict,
  role text not null check (role in ('admin','auctioneer','team_rep','viewer')),
  created_at timestamptz not null default now()
);

-- Helper function to get the current user's org_id from profiles
create or replace function public.fn_current_org_id()
returns uuid
language sql
stable
as $$
  select org_id from public.profiles where id = auth.uid() limit 1;
$$;

-- Auctions
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  status text not null check (status in ('draft','live','paused','completed')) default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_auctions_org on public.auctions (org_id);

-- Add auction-level configuration fields
alter table public.auctions add column if not exists auction_date date;
alter table public.auctions add column if not exists base_price bigint default 0;
alter table public.auctions add column if not exists total_purse bigint default 0;
alter table public.auctions add column if not exists max_players_per_team int default 0;
-- Auction logo fields (uploaded path or external URL)
alter table public.auctions add column if not exists logo_path text;
alter table public.auctions add column if not exists logo_url text;
-- Current set selection for console
alter table public.auctions add column if not exists current_set_id uuid references public.auction_sets (id) on delete set null;
create index if not exists idx_auctions_current_set on public.auctions (current_set_id);
-- Current player selection for console
alter table public.auctions add column if not exists current_player_id uuid references public.auction_players (id) on delete set null;
create index if not exists idx_auctions_current_player on public.auctions (current_player_id);
-- Queue scope: default (all), set (current_set_id), unsold (status=unsold)
alter table public.auctions add column if not exists queue_scope text not null default 'default' check (queue_scope in ('default','set','unsold'));

-- Teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  name text not null,
  purse_total bigint not null default 0,
  purse_remaining bigint not null default 0,
  max_players int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_teams_org on public.teams (org_id);
create index if not exists idx_teams_auction on public.teams (auction_id);
-- Ensure team names are unique within an auction
create unique index if not exists uq_teams_auction_name on public.teams (auction_id, name);
-- Logo fields (uploaded path or external URL)
alter table public.teams add column if not exists logo_path text;
alter table public.teams add column if not exists logo_url text;

-- View: team counts per auction (for dashboard optimization)
create or replace view public.v_auction_team_counts as
  select auction_id, count(*)::int as teams_count
  from public.teams
  group by auction_id;

-- View: team aggregates (players_count, spent_total, purse_remaining)
create or replace view public.v_team_aggregates as
  select
    t.auction_id,
    t.id as team_id,
    count(a.id)::int as players_count,
    coalesce(sum(a.price), 0)::bigint as spent_total,
    greatest(coalesce(t.purse_total,0) - coalesce(sum(a.price),0), 0)::bigint as purse_remaining
  from public.teams t
  left join public.assignments a on a.team_id = t.id
  group by t.auction_id, t.id, t.purse_total;

-- View: auction queue (next available player and remaining count)
create or replace view public.v_auction_queue as
  with pool as (
    select ap.auction_id, ap.id, ap.name, ap.created_at
    from public.auction_players ap
    join public.auctions a on a.id = ap.auction_id
    where (
      (a.queue_scope = 'unsold' and ap.status = 'unsold')
      or (a.queue_scope = 'set' and ap.status = 'available' and a.current_set_id is not null and ap.set_id = a.current_set_id)
      or (a.queue_scope = 'default' and ap.status = 'available')
    )
  )
  select
    a.id as auction_id,
    (select id from pool where auction_id = a.id order by created_at asc limit 1) as next_player_id,
    (select name from pool where auction_id = a.id order by created_at asc limit 1) as next_player_name,
    (select count(*) from pool where auction_id = a.id)::int as remaining_available
  from public.auctions a;

-- View: auction summary (teams_count, total_spend, remaining_purse, sold_count, unsold_count)
create or replace view public.v_auction_summary as
  with spend as (
    select auction_id, coalesce(sum(price),0)::bigint as total_spend, count(*)::int as sold_count
    from public.assignments
    group by auction_id
  ),
  teams as (
    select auction_id, count(*)::int as teams_count, coalesce(sum(purse_total),0)::bigint as total_purse
    from public.teams
    group by auction_id
  ),
  unsold as (
    select auction_id, count(*)::int as unsold_count
    from public.auction_players
    where status = 'unsold'
    group by auction_id
  )
  select
    a.id as auction_id,
    coalesce(t.teams_count, 0) as teams_count,
    coalesce(s.total_spend, 0) as total_spend,
    greatest(coalesce(t.total_purse,0) - coalesce(s.total_spend,0), 0)::bigint as remaining_purse,
    coalesce(s.sold_count, 0) as sold_count,
    coalesce(u.unsold_count, 0) as unsold_count
  from public.auctions a
  left join teams t on t.auction_id = a.id
  left join spend s on s.auction_id = a.id
  left join unsold u on u.auction_id = a.id;

-- Helpful indexes for console workloads
create index if not exists idx_assignments_auction_team on public.assignments (auction_id, team_id);
create index if not exists idx_assignments_auction_player on public.assignments (auction_id, player_id);
create index if not exists idx_bids_auction_created on public.bids (auction_id, created_at);
create index if not exists idx_incrules_auction_threshold on public.increment_rules (auction_id, threshold);

-- Players
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sport text,
  base_price bigint not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_players_org on public.players (org_id);
-- Remove legacy position column if present
alter table public.players drop column if exists position;

-- Auction-specific players (registration per auction)
create table if not exists public.auction_players (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  name text not null,
  base_price bigint not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (auction_id, name)
);
create index if not exists idx_auction_players_auction on public.auction_players (auction_id);
-- Extend auction_players for console management
alter table public.auction_players add column if not exists category text;
alter table public.auction_players add column if not exists status text not null default 'available' check (status in ('available','sold','unsold','withheld'));
alter table public.auction_players add column if not exists photo_path text;
alter table public.auction_players add column if not exists photo_url text;
alter table public.auction_players add column if not exists set_id uuid references public.auction_sets (id) on delete set null;
create index if not exists idx_auction_players_set on public.auction_players (set_id);
-- Remove legacy position column if present
alter table public.auction_players drop column if exists position;
-- Player stats fields (per auction)
alter table public.auction_players add column if not exists bat_style text;
alter table public.auction_players add column if not exists bowl_style text;
alter table public.auction_players add column if not exists matches bigint;
alter table public.auction_players add column if not exists runs bigint;
alter table public.auction_players add column if not exists average numeric(6,2);
alter table public.auction_players add column if not exists strike_rate numeric(6,2);
alter table public.auction_players add column if not exists overs numeric(5,1);
alter table public.auction_players add column if not exists wickets bigint;
alter table public.auction_players add column if not exists economy numeric(5,2);
alter table public.auction_players add column if not exists notes text;

-- Auction Sets
create table if not exists public.auction_sets (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  name text not null,
  ord int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_sets_auction on public.auction_sets (auction_id);

-- Player to Set mapping
create table if not exists public.player_sets (
  player_id uuid not null references public.players (id) on delete cascade,
  set_id uuid not null references public.auction_sets (id) on delete cascade,
  ord int not null default 0,
  primary key (player_id, set_id)
);

-- Increment Rules
create table if not exists public.increment_rules (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  threshold bigint not null,
  increment bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_incrules_auction on public.increment_rules (auction_id);

-- Bids
create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  amount bigint not null,
  by_user uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_bids_auction on public.bids (auction_id);
create index if not exists idx_bids_player on public.bids (player_id);

-- Assignments (final sale)
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  price bigint not null,
  created_at timestamptz not null default now(),
  unique (auction_id, player_id)
);
create index if not exists idx_assignments_auction on public.assignments (auction_id);

-- Auction events (event-sourced log)
create table if not exists public.auction_events (
  id bigserial primary key,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  type text not null,
  payload jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_auction on public.auction_events (auction_id);

-- Enable RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.auctions enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.auction_sets enable row level security;
alter table public.player_sets enable row level security;
alter table public.increment_rules enable row level security;
alter table public.bids enable row level security;
alter table public.assignments enable row level security;
alter table public.auction_events enable row level security;
alter table public.auction_players enable row level security;

-- Policies: org-scoped access
-- Organizations: users can see their own org; only service role should insert/delete
create policy org_read_own on public.organizations
for select using (id = fn_current_org_id());

-- Profiles: users can see/update their own profile
create policy profiles_read_own on public.profiles
for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
for update using (id = auth.uid());

-- Generic helper to create org-bound policies
-- Auctions
create policy auctions_select_same_org on public.auctions for select using (org_id = fn_current_org_id());
create policy auctions_insert_same_org on public.auctions for insert with check (org_id = fn_current_org_id());
create policy auctions_update_same_org on public.auctions for update using (org_id = fn_current_org_id());
create policy auctions_delete_same_org on public.auctions for delete using (org_id = fn_current_org_id());

-- Teams
create policy teams_select_same_org on public.teams for select using (org_id = fn_current_org_id());
create policy teams_insert_same_org on public.teams for insert with check (org_id = fn_current_org_id());
create policy teams_update_same_org on public.teams for update using (org_id = fn_current_org_id());
create policy teams_delete_same_org on public.teams for delete using (org_id = fn_current_org_id());

-- Players
create policy players_select_same_org on public.players for select using (org_id = fn_current_org_id());
create policy players_insert_same_org on public.players for insert with check (org_id = fn_current_org_id());
create policy players_update_same_org on public.players for update using (org_id = fn_current_org_id());
create policy players_delete_same_org on public.players for delete using (org_id = fn_current_org_id());

-- Sets
create policy sets_select_same_org on public.auction_sets for select using (
  exists(select 1 from public.auctions a where a.id = auction_sets.auction_id and a.org_id = fn_current_org_id())
);
create policy sets_insert_same_org on public.auction_sets for insert with check (
  exists(select 1 from public.auctions a where a.id = auction_sets.auction_id and a.org_id = fn_current_org_id())
);
create policy sets_update_same_org on public.auction_sets for update using (
  exists(select 1 from public.auctions a where a.id = auction_sets.auction_id and a.org_id = fn_current_org_id())
);
create policy sets_delete_same_org on public.auction_sets for delete using (
  exists(select 1 from public.auctions a where a.id = auction_sets.auction_id and a.org_id = fn_current_org_id())
);

-- Player sets (via set -> auction -> org)
create policy playersets_select_same_org on public.player_sets for select using (
  exists(select 1 from public.auction_sets s join public.auctions a on a.id = s.auction_id where s.id = player_sets.set_id and a.org_id = fn_current_org_id())
);
create policy playersets_insert_same_org on public.player_sets for insert with check (
  exists(select 1 from public.auction_sets s join public.auctions a on a.id = s.auction_id where s.id = player_sets.set_id and a.org_id = fn_current_org_id())
);
create policy playersets_delete_same_org on public.player_sets for delete using (
  exists(select 1 from public.auction_sets s join public.auctions a on a.id = s.auction_id where s.id = player_sets.set_id and a.org_id = fn_current_org_id())
);

-- Increment rules (via auction -> org)
create policy incrules_select_same_org on public.increment_rules for select using (
  exists(select 1 from public.auctions a where a.id = increment_rules.auction_id and a.org_id = fn_current_org_id())
);
create policy incrules_cud_same_org on public.increment_rules for all using (
  exists(select 1 from public.auctions a where a.id = increment_rules.auction_id and a.org_id = fn_current_org_id())
) with check (
  exists(select 1 from public.auctions a where a.id = increment_rules.auction_id and a.org_id = fn_current_org_id())
);

-- Bids
create policy bids_select_same_org on public.bids for select using (
  exists(select 1 from public.auctions a where a.id = bids.auction_id and a.org_id = fn_current_org_id())
);
create policy bids_insert_same_org on public.bids for insert with check (
  exists(select 1 from public.auctions a where a.id = bids.auction_id and a.org_id = fn_current_org_id())
);

-- Assignments
create policy assignments_select_same_org on public.assignments for select using (
  exists(select 1 from public.auctions a where a.id = assignments.auction_id and a.org_id = fn_current_org_id())
);
create policy assignments_insert_same_org on public.assignments for insert with check (
  exists(select 1 from public.auctions a where a.id = assignments.auction_id and a.org_id = fn_current_org_id())
);

-- Events (read-only for org)
create policy events_select_same_org on public.auction_events for select using (
  exists(select 1 from public.auctions a where a.id = auction_events.auction_id and a.org_id = fn_current_org_id())
);

-- Realtime publications (include core tables)
alter publication supabase_realtime add table public.auctions;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.auction_events;
alter publication supabase_realtime add table public.auction_players;
alter publication supabase_realtime add table public.console_prefs;

-- Storage buckets and policies for images
insert into storage.buckets (id, name, public) values
  ('team-logos','team-logos', true),
  ('player-photos','player-photos', true),
  ('auction-logos','auction-logos', true)
on conflict (id) do nothing;

-- Public read
create policy if not exists storage_public_read_teamlogos on storage.objects
for select using (bucket_id = 'team-logos');
create policy if not exists storage_public_read_playerphotos on storage.objects
for select using (bucket_id = 'player-photos');
create policy if not exists storage_public_read_auctionlogos on storage.objects
for select using (bucket_id = 'auction-logos');

-- Authenticated write (insert/update/delete)
create policy if not exists storage_auth_write_teamlogos on storage.objects
for insert with check (bucket_id = 'team-logos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_update_teamlogos on storage.objects
for update using (bucket_id = 'team-logos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_delete_teamlogos on storage.objects
for delete using (bucket_id = 'team-logos' and auth.role() = 'authenticated');

create policy if not exists storage_auth_write_playerphotos on storage.objects
for insert with check (bucket_id = 'player-photos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_update_playerphotos on storage.objects
for update using (bucket_id = 'player-photos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_delete_playerphotos on storage.objects
for delete using (bucket_id = 'player-photos' and auth.role() = 'authenticated');

create policy if not exists storage_auth_write_auctionlogos on storage.objects
for insert with check (bucket_id = 'auction-logos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_update_auctionlogos on storage.objects
for update using (bucket_id = 'auction-logos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_delete_auctionlogos on storage.objects
for delete using (bucket_id = 'auction-logos' and auth.role() = 'authenticated'); 

-- Console UI Preferences (per user per auction)
create table if not exists public.console_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  auction_id uuid not null references public.auctions (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, auction_id)
);
alter table public.console_prefs enable row level security;
drop policy if exists console_prefs_read_own on public.console_prefs;
create policy console_prefs_read_own on public.console_prefs for select using (user_id = auth.uid());
drop policy if exists console_prefs_write_own on public.console_prefs;
create policy console_prefs_write_own on public.console_prefs for insert with check (user_id = auth.uid());
drop policy if exists console_prefs_update_own on public.console_prefs;
create policy console_prefs_update_own on public.console_prefs for update using (user_id = auth.uid()); 

-- Sponsors per auction
create table if not exists public.auction_sponsors (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions (id) on delete cascade,
  name text not null,
  sponsor_type text not null check (sponsor_type in ('title','regular')) default 'regular',
  logo_path text,
  logo_url text,
  ord int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_sponsors_auction on public.auction_sponsors (auction_id);

alter table public.auction_sponsors enable row level security;
drop policy if exists sponsors_select_same_org on public.auction_sponsors;
create policy sponsors_select_same_org on public.auction_sponsors for select using (
  exists(select 1 from public.auctions a where a.id = auction_sponsors.auction_id and a.org_id = fn_current_org_id())
);
drop policy if exists sponsors_write_same_org on public.auction_sponsors;
create policy sponsors_write_same_org on public.auction_sponsors for insert with check (
  exists(select 1 from public.auctions a where a.id = auction_sponsors.auction_id and a.org_id = fn_current_org_id())
);
drop policy if exists sponsors_update_same_org on public.auction_sponsors;
create policy sponsors_update_same_org on public.auction_sponsors for update using (
  exists(select 1 from public.auctions a where a.id = auction_sponsors.auction_id and a.org_id = fn_current_org_id())
);
drop policy if exists sponsors_delete_same_org on public.auction_sponsors;
create policy sponsors_delete_same_org on public.auction_sponsors for delete using (
  exists(select 1 from public.auctions a where a.id = auction_sponsors.auction_id and a.org_id = fn_current_org_id())
);

alter publication supabase_realtime add table public.auction_sponsors;

-- Storage bucket for sponsor logos
insert into storage.buckets (id, name, public) values ('sponsor-logos','sponsor-logos', true) on conflict (id) do nothing;
create policy if not exists storage_public_read_sponsorlogos on storage.objects for select using (bucket_id = 'sponsor-logos');
create policy if not exists storage_auth_write_sponsorlogos on storage.objects for insert with check (bucket_id = 'sponsor-logos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_update_sponsorlogos on storage.objects for update using (bucket_id = 'sponsor-logos' and auth.role() = 'authenticated');
create policy if not exists storage_auth_delete_sponsorlogos on storage.objects for delete using (bucket_id = 'sponsor-logos' and auth.role() = 'authenticated'); 