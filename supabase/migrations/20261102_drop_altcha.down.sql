-- Reverts 20261102_drop_altcha.sql.
--
-- The original functions were created by hand in the Supabase project and were
-- never committed, so this restores a working equivalent rather than the exact
-- text that was there before. It is only needed if the app is rolled back to a
-- build that still asks for the captcha; the current code never calls these
-- functions.
--
-- Behaviour, matching what the removed api/_lib/altcha.js expected:
--   altcha_register(id, expires) -> true        stores a fresh challenge id
--   altcha_consume(id)           -> true/false  marks it used, once
--
-- A challenge is consumed only if it exists, has not been used and has not
-- expired, so a replayed proof can never be accepted twice.

begin;

create table if not exists public.altcha_challenges (
  id text primary key,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists altcha_challenges_expires_idx
  on public.altcha_challenges (expires_at);

alter table public.altcha_challenges enable row level security;

-- The table is only ever reached through the RPCs below; no direct access.
revoke all on public.altcha_challenges from anon, authenticated;

create or replace function public.altcha_register(p_id text, p_expires timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_id is null or length(p_id) < 16 or p_id !~ '^[A-Za-z0-9_-]{16,128}$' then
    return false;
  end if;
  if p_expires is null or p_expires <= now() or p_expires > now() + interval '1 hour' then
    return false;
  end if;
  insert into public.altcha_challenges (id, expires_at)
  values (p_id, p_expires)
  on conflict (id) do nothing;
  -- Housekeeping: expired rows are never usable again.
  delete from public.altcha_challenges where expires_at < now() - interval '1 day';
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.altcha_consume(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed boolean;
begin
  if p_id is null then
    return false;
  end if;
  update public.altcha_challenges
     set used_at = now()
   where id = p_id
     and used_at is null
     and expires_at > now()
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.altcha_register(text, timestamptz) from public;
revoke all on function public.altcha_consume(text) from public;
grant execute on function public.altcha_register(text, timestamptz) to anon;
grant execute on function public.altcha_consume(text) to anon;

commit;
