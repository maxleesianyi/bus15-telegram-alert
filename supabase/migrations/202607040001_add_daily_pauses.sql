create table if not exists public.bus15_daily_pauses (
  pause_date date primary key,
  reason text not null default 'telegram_command',
  source_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bus15_daily_pauses enable row level security;
