-- ARO Intelligence Layer — Supabase migration
-- Run: supabase db push  OR  paste into Supabase SQL Editor

-- ─── Categories ──────────────────────────────────────────────
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  parent     text,
  tags       text[] default '{}',
  created_at timestamptz default now()
);

-- ─── Targets ─────────────────────────────────────────────────
create table if not exists targets (
  id                      uuid primary key default gen_random_uuid(),
  platform                text not null,
  username                text not null,
  display_name            text,
  url                     text,
  category_id             uuid references categories(id),
  follower_count          int,
  link_in_bio             bool default false,
  signals                 jsonb default '{}'::jsonb,
  influence_score         numeric default 0,
  conversion_probability  numeric default 0,
  layer                   int not null default 5,
  void_flag               bool default false,
  status                  text default 'new',
  created_at              timestamptz default now(),
  unique(platform, username)
);

create index if not exists idx_targets_layer_conv
  on targets (layer, conversion_probability desc);

-- ─── Serials ─────────────────────────────────────────────────
create table if not exists aro_serials (
  id                 uuid primary key default gen_random_uuid(),
  serial_number      int unique not null,
  reserved           bool default false,
  assigned_target_id uuid references targets(id),
  claimed            bool default false,
  claimed_at         timestamptz,
  created_at         timestamptz default now()
);

create index if not exists idx_serials_number
  on aro_serials (serial_number);

-- Seed reserved serials 1-1000
insert into aro_serials (serial_number, reserved)
select s, true
from generate_series(1, 1000) as s
on conflict (serial_number) do nothing;

-- Seed available serials 1001-10000
insert into aro_serials (serial_number, reserved)
select s, false
from generate_series(1001, 10000) as s
on conflict (serial_number) do nothing;

-- ─── next_serial() function ──────────────────────────────────
create or replace function next_serial()
returns int
language plpgsql
as $$
declare
  result int;
begin
  select serial_number into result
  from aro_serials
  where reserved = false
    and assigned_target_id is null
  order by serial_number
  limit 1
  for update skip locked;

  if result is null then
    -- All serials used, extend the pool
    insert into aro_serials (serial_number, reserved)
    select coalesce(max(serial_number), 10000) + 1, false
    from aro_serials
    returning serial_number into result;
  end if;

  return result;
end;
$$;

-- ─── Message Variants ────────────────────────────────────────
create table if not exists message_variants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  layer       int not null,
  category_id uuid references categories(id),
  template    text not null,
  max_words   int default 15,
  active      bool default true,
  created_at  timestamptz default now()
);

-- ─── Messages ────────────────────────────────────────────────
create table if not exists aro_messages (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid references targets(id),
  serial_number int not null,
  variant_id    uuid references message_variants(id),
  body          text not null,
  channel       text not null,
  scheduled_at  timestamptz,
  created_at    timestamptz default now()
);

create index if not exists idx_messages_channel_sched
  on aro_messages (channel, scheduled_at);

-- ─── Distribution Plans ──────────────────────────────────────
create table if not exists distribution_plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan_json  jsonb not null,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  created_at timestamptz default now()
);

-- ─── Events ──────────────────────────────────────────────────
create table if not exists aro_events (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid references targets(id),
  message_id  uuid references aro_messages(id),
  channel     text,
  event_type  text not null,
  event_value numeric,
  meta        jsonb default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at  timestamptz default now()
);

create index if not exists idx_events_type_time
  on aro_events (event_type, occurred_at);

-- ─── Learning Snapshots ──────────────────────────────────────
create table if not exists learning_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapshot_json jsonb not null,
  created_at    timestamptz default now()
);
