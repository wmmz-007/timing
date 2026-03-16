create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  timestamptz not null,
  timezone    text not null default 'Asia/Bangkok'
);

create table if not exists finish_records (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  bib_number  text not null,
  finish_time timestamptz not null,
  created_at  timestamptz not null default now(),
  unique(event_id, bib_number)
);

create index if not exists finish_records_event_id_idx on finish_records(event_id);
create index if not exists finish_records_finish_time_idx on finish_records(finish_time);
