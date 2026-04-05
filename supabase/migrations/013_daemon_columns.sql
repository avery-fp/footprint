-- Add dispatch tracking columns to aro_messages for the daemon
alter table aro_messages
  add column if not exists sent_at       timestamptz,
  add column if not exists sent_provider text;

-- Index for daemon queue polling: unsent email messages ordered by schedule
create index if not exists idx_messages_daemon_queue
  on aro_messages (channel, scheduled_at)
  where sent_at is null;
