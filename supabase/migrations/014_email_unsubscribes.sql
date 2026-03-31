create table if not exists email_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now()
);
