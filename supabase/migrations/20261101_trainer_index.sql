-- Trainer panel, phase 1: derived read index over app_data.
--
-- Invariant: app_data is the source of truth. session_index and training_plans
-- are caches that can be dropped and rebuilt at any time; trainer_links is the
-- only table with writes of its own, and it only records who may read whom.
-- Nothing here is ever read back into app_data.
--
-- Idempotent and additive: it creates tables, policies and functions without
-- touching existing rows. The down migration drops everything it adds.

begin;

-- ------------------------------------------------------------------ helpers
-- Dirty JSON must never abort the index: bad dates or numbers become null
-- instead of raising, so one malformed session cannot block the rest.

create or replace function public.dt_safe_date(p text)
returns date
language plpgsql
immutable
strict
as $fn$
begin
  return p::date;
exception when others then
  return null;
end;
$fn$;

create or replace function public.dt_safe_num(p text)
returns numeric
language plpgsql
immutable
strict
as $fn$
begin
  return p::numeric;
exception when others then
  return null;
end;
$fn$;

-- ------------------------------------------------------------------ index
create table if not exists public.session_index (
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  session_date date not null,
  duration_sec bigint,
  volume_kg numeric,
  sets_done bigint,
  reps bigint,
  exercise_ids text[] not null default '{}',
  source_hash text not null,
  indexed_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

comment on table public.session_index is
  'Derived, disposable index of finished sessions. Rebuilt from app_data; never authoritative.';
comment on column public.session_index.source_hash is
  'md5 of the session fragment in app_data, used to skip unchanged rows when reindexing.';
comment on column public.session_index.exercise_ids is
  'Stable exercise ids (exId) touched by the session. Muscle groups are resolved in the client from the shared catalog, not duplicated here.';

create index if not exists session_index_date_idx
  on public.session_index (user_id, session_date desc);

-- ------------------------------------------------------------------ links
create table if not exists public.trainer_links (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users (id) on delete cascade,
  trainee_id uuid references auth.users (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{10}$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  invite_expires_at timestamptz not null default now() + interval '7 days',
  consented_at timestamptz,
  revoked_at timestamptz,
  constraint trainer_links_no_self check (trainee_id is null or trainee_id <> trainer_id),
  constraint trainer_links_invite_window check (invite_expires_at > created_at),
  constraint trainer_links_state check (
    (status = 'pending' and trainee_id is null and consented_at is null and revoked_at is null)
    or (status = 'active' and trainee_id is not null and consented_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

comment on table public.trainer_links is
  'Consent record between trainer and trainee. The only table here whose rows are not derived from app_data.';
comment on column public.trainer_links.consented_at is
  'Set by the trainee when they redeem the invitation. Consent is written by the trainee, never by the trainer.';
comment on column public.trainer_links.invite_expires_at is
  'Pending invitations stop being redeemable after this instant; the row stays so the trainer can cancel it.';

-- One live link per pair; a revoked link stays as history and can be replaced.
create unique index if not exists trainer_links_pair_idx
  on public.trainer_links (trainer_id, trainee_id)
  where trainee_id is not null and status <> 'revoked';

create index if not exists trainer_links_trainer_idx
  on public.trainer_links (trainer_id) where status = 'active';

create index if not exists trainer_links_trainee_idx
  on public.trainer_links (trainee_id) where status = 'active';

-- ------------------------------------------------------------------ plans
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references auth.users (id) on delete cascade,
  trainer_id uuid references auth.users (id) on delete set null,
  name text check (char_length(name) <= 120),
  sessions_per_week smallint not null check (sessions_per_week between 1 and 14),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plans_range check (ended_on is null or ended_on >= started_on)
);

comment on table public.training_plans is
  'Active plan per trainee. Adherence is computed as indexed sessions over the planned sessions per week.';

-- One open plan at a time; ending it keeps the history.
create unique index if not exists training_plans_one_active_idx
  on public.training_plans (trainee_id) where ended_on is null;

create index if not exists training_plans_trainer_idx
  on public.training_plans (trainer_id) where ended_on is null;

-- ------------------------------------------------------------------ trigger
-- Same transaction as the save: if this fails, the session is still stored
-- (the index is disposable), and dt_reindex_* repairs the gap later.
create or replace function public.dt_sync_session_index()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user uuid;
  v_seen text[];
begin
  if tg_op = 'DELETE' then
    delete from public.session_index where user_id = old.user_id;
    return old;
  end if;

  v_user := new.user_id;

  begin
    select coalesce(array_agg(t.session_id), '{}') into v_seen
      from public.dt_session_rows(new.data) t;

    insert into public.session_index as si
      (user_id, session_id, session_date, duration_sec, volume_kg, sets_done, reps, exercise_ids, source_hash, indexed_at)
    select v_user, t.session_id, t.session_date, t.duration_sec, t.volume_kg, t.sets_done, t.reps, t.exercise_ids, t.source_hash, now()
      from public.dt_session_rows(new.data) t
    on conflict (user_id, session_id) do update
      set session_date = excluded.session_date,
          duration_sec = excluded.duration_sec,
          volume_kg = excluded.volume_kg,
          sets_done = excluded.sets_done,
          reps = excluded.reps,
          exercise_ids = excluded.exercise_ids,
          source_hash = excluded.source_hash,
          indexed_at = now()
      where si.source_hash is distinct from excluded.source_hash;

    delete from public.session_index
      where user_id = v_user and not (session_id = any (v_seen));
  exception when others then
    raise warning 'dt_sync_session_index(%): %', v_user, sqlerrm;
  end;

  return new;
end;
$fn$;

drop trigger if exists app_data_session_index on public.app_data;
create trigger app_data_session_index
  after insert or update of data or delete on public.app_data
  for each row execute function public.dt_sync_session_index();

-- ------------------------------------------------------------------ source
-- One row per finished session found in app_data. Sessions without a valid id
-- or date are skipped on purpose: they cannot be indexed without guessing.
create or replace function public.dt_session_rows(p_data jsonb)
returns table (
  session_id text,
  session_date date,
  duration_sec bigint,
  volume_kg numeric,
  sets_done bigint,
  reps bigint,
  exercise_ids text[],
  source_hash text
)
language sql
immutable
as $fn$
  select distinct on (r.session_id)
    r.session_id, r.session_date, r.duration_sec, r.volume_kg,
    r.sets_done, r.reps, r.exercise_ids, r.source_hash
  from (
    select
      s->>'id' as session_id,
      public.dt_safe_date(s->>'date') as session_date,
      round(public.dt_safe_num(s->'summary'->>'durationSec'))::bigint as duration_sec,
      public.dt_safe_num(s->'summary'->>'volume') as volume_kg,
      round(public.dt_safe_num(s->'summary'->>'setsEffective'))::bigint as sets_done,
      round(public.dt_safe_num(s->'summary'->>'reps'))::bigint as reps,
      coalesce(
        (select array_agg(distinct coalesce(e->>'exId', e->>'name'))
           from jsonb_array_elements(coalesce(s->'exercises', '[]'::jsonb)) e
          where coalesce(e->>'exId', e->>'name') is not null),
        '{}'::text[]
      ) as exercise_ids,
      md5(s::text) as source_hash
    from jsonb_array_elements(coalesce(p_data->'sessions', '[]'::jsonb)) s
    where coalesce(s->'finished', 'false'::jsonb) = 'true'::jsonb
      and coalesce(s->>'id', '') <> ''
      and public.dt_safe_date(s->>'date') is not null
  ) r
  order by r.session_id
$fn$;

comment on function public.dt_session_rows(jsonb) is
  'Extracts indexable sessions from an app_data payload. Duplicated ids keep the first occurrence.';

-- ------------------------------------------------------------------ reindex
create or replace function public.dt_reindex_sessions(p_user uuid)
returns table (sessions bigint, written bigint, deleted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_sessions bigint := 0;
  v_written bigint := 0;
  v_deleted bigint := 0;
begin
  with src as (
    select t.*
      from public.app_data a
      cross join lateral public.dt_session_rows(a.data) t
     where a.user_id = p_user
  ),
  up as (
    insert into public.session_index as si
      (user_id, session_id, session_date, duration_sec, volume_kg, sets_done, reps, exercise_ids, source_hash, indexed_at)
    select p_user, s.session_id, s.session_date, s.duration_sec, s.volume_kg, s.sets_done, s.reps, s.exercise_ids, s.source_hash, now()
      from src s
    on conflict (user_id, session_id) do update
      set session_date = excluded.session_date,
          duration_sec = excluded.duration_sec,
          volume_kg = excluded.volume_kg,
          sets_done = excluded.sets_done,
          reps = excluded.reps,
          exercise_ids = excluded.exercise_ids,
          source_hash = excluded.source_hash,
          indexed_at = now()
      where si.source_hash is distinct from excluded.source_hash
    returning 1
  ),
  del as (
    delete from public.session_index si
     where si.user_id = p_user
       and not exists (select 1 from src s where s.session_id = si.session_id)
    returning 1
  )
  select (select count(*) from src), (select count(*) from up), (select count(*) from del)
    into v_sessions, v_written, v_deleted;

  return query select v_sessions, v_written, v_deleted;
end;
$fn$;

comment on function public.dt_reindex_sessions(uuid) is
  'Rebuilds the index for one user from app_data. Writes only rows whose source hash changed; deletes rows no longer present.';

create or replace function public.dt_reindex_all_sessions()
returns table (users bigint, sessions bigint, written bigint, deleted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user uuid;
  v_res record;
  v_users bigint := 0;
  v_sessions bigint := 0;
  v_written bigint := 0;
  v_deleted bigint := 0;
begin
  delete from public.session_index si
   where not exists (select 1 from public.app_data a where a.user_id = si.user_id);

  for v_user in select a.user_id from public.app_data a loop
    select * into v_res from public.dt_reindex_sessions(v_user);
    v_users := v_users + 1;
    v_sessions := v_sessions + v_res.sessions;
    v_written := v_written + v_res.written;
    v_deleted := v_deleted + v_res.deleted;
  end loop;

  return query select v_users, v_sessions, v_written, v_deleted;
end;
$fn$;

comment on function public.dt_reindex_all_sessions() is
  'Full rebuild for every account, plus cleanup of rows whose app_data no longer exists. Run after migrations.';

-- ------------------------------------------------------------------ invites
create or replace function public.dt_create_trainer_invite()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_trainer uuid := auth.uid();
  v_code text;
  v_try int := 0;
begin
  if v_trainer is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if (select count(*) from public.trainer_links where trainer_id = v_trainer and status = 'active') >= 50 then
    raise exception 'too_many_trainees' using errcode = '54000';
  end if;

  -- Someone who starts inviting is a trainer. The role lives in profiles and is
  -- only ever widened here, never downgraded; the guard keeps this migration
  -- usable even if profiles has not been applied yet.
  if to_regclass('public.profiles') is not null then
    update public.profiles set role = 'trainer' where id = v_trainer and role = 'athlete';
  end if;

  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.trainer_links (trainer_id, invite_code) values (v_trainer, v_code);
      return v_code;
    exception when unique_violation then
      if v_try >= 5 then
        raise exception 'invite_generation_failed' using errcode = '54000';
      end if;
    end;
  end loop;
end;
$fn$;

create or replace function public.dt_redeem_trainer_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_trainee uuid := auth.uid();
  v_link uuid;
begin
  if v_trainee is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.trainer_links
     set trainee_id = v_trainee, status = 'active', consented_at = now()
   where invite_code = upper(btrim(coalesce(p_code, '')))
     and status = 'pending'
     and trainer_id <> v_trainee
     and invite_expires_at > now()
  returning id into v_link;

  if v_link is null then
    if exists (
      select 1 from public.trainer_links
       where invite_code = upper(btrim(coalesce(p_code, '')))
         and status = 'pending'
         and invite_expires_at <= now()
    ) then
      raise exception 'invite_expired' using errcode = 'P0002';
    end if;
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  return v_link;
exception when unique_violation then
  raise exception 'already_linked' using errcode = '23505';
end;
$fn$;

create or replace function public.dt_revoke_trainer_link(p_link uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me uuid := auth.uid();
  v_done boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.trainer_links
     set status = 'revoked', revoked_at = now()
   where id = p_link
     and (trainer_id = v_me or trainee_id = v_me)
     and status <> 'revoked'
  returning true into v_done;

  return coalesce(v_done, false);
end;
$fn$;

comment on function public.dt_redeem_trainer_invite(text) is
  'Accepts an unexpired invitation as the signed-in user. The trainee''s own consent is the row that turns active.';
comment on function public.dt_create_trainer_invite() is
  'Mints a single-use invitation valid for 7 days and widens the caller''s role to trainer.';

-- ------------------------------------------------------------------ access
alter table public.session_index enable row level security;
alter table public.trainer_links enable row level security;
alter table public.training_plans enable row level security;

revoke all on table public.session_index from anon, authenticated;
grant select on table public.session_index to authenticated;

revoke all on table public.trainer_links from anon, authenticated;
grant select, insert, delete on table public.trainer_links to authenticated;

revoke all on table public.training_plans from anon, authenticated;
grant select, insert, update on table public.training_plans to authenticated;

-- Index: the owner reads their own rows. Writes happen only through the
-- trigger and the reindex functions, which run as the table owner.
drop policy if exists session_index_own_read on public.session_index;
create policy session_index_own_read on public.session_index
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists session_index_trainer_read on public.session_index;
create policy session_index_trainer_read on public.session_index
  for select to authenticated
  using (exists (
    select 1 from public.trainer_links l
     where l.trainee_id = session_index.user_id
       and l.trainer_id = auth.uid()
       and l.status = 'active'
       and l.consented_at is not null
  ));

drop policy if exists trainer_links_participants_read on public.trainer_links;
create policy trainer_links_participants_read on public.trainer_links
  for select to authenticated
  using (trainer_id = auth.uid() or trainee_id = auth.uid());

drop policy if exists trainer_links_trainer_invite on public.trainer_links;
create policy trainer_links_trainer_invite on public.trainer_links
  for insert to authenticated
  with check (trainer_id = auth.uid() and trainee_id is null and status = 'pending');

drop policy if exists trainer_links_trainer_cancel on public.trainer_links;
create policy trainer_links_trainer_cancel on public.trainer_links
  for delete to authenticated
  using (trainer_id = auth.uid() and status = 'pending');

drop policy if exists training_plans_read on public.training_plans;
create policy training_plans_read on public.training_plans
  for select to authenticated
  using (
    trainee_id = auth.uid()
    or exists (
      select 1 from public.trainer_links l
       where l.trainee_id = training_plans.trainee_id
         and l.trainer_id = auth.uid()
         and l.status = 'active'
         and l.consented_at is not null
    )
  );

drop policy if exists training_plans_trainer_insert on public.training_plans;
create policy training_plans_trainer_insert on public.training_plans
  for insert to authenticated
  with check (exists (
    select 1 from public.trainer_links l
     where l.trainee_id = training_plans.trainee_id
       and l.trainer_id = auth.uid()
       and l.status = 'active'
       and l.consented_at is not null
  ));

drop policy if exists training_plans_trainer_update on public.training_plans;
create policy training_plans_trainer_update on public.training_plans
  for update to authenticated
  using (exists (
    select 1 from public.trainer_links l
     where l.trainee_id = training_plans.trainee_id
       and l.trainer_id = auth.uid()
       and l.status = 'active'
       and l.consented_at is not null
  ))
  with check (exists (
    select 1 from public.trainer_links l
     where l.trainee_id = training_plans.trainee_id
       and l.trainer_id = auth.uid()
       and l.status = 'active'
       and l.consented_at is not null
  ));

-- A trainer may read the profile of a trainee who consented, and a trainee the
-- profile of their trainer. Guarded so this migration also applies on a
-- database where 20261101_profiles.sql has not been run yet.
do $do$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists profiles_linked_read on public.profiles';
    execute $policy$
      create policy profiles_linked_read on public.profiles
        for select to authenticated
        using (exists (
          select 1 from public.trainer_links l
           where l.status = 'active'
             and l.consented_at is not null
             and (
               (l.trainer_id = auth.uid() and l.trainee_id = profiles.id)
               or (l.trainee_id = auth.uid() and l.trainer_id = profiles.id)
             )
        ))
    $policy$;
  end if;
end
$do$;

-- Function surface: participants may invite, accept and revoke; only the
-- service role may reindex.
revoke all on function public.dt_create_trainer_invite() from public;
revoke all on function public.dt_redeem_trainer_invite(text) from public;
revoke all on function public.dt_revoke_trainer_link(uuid) from public;
revoke all on function public.dt_reindex_sessions(uuid) from public;
revoke all on function public.dt_reindex_all_sessions() from public;

grant execute on function public.dt_create_trainer_invite() to authenticated;
grant execute on function public.dt_redeem_trainer_invite(text) to authenticated;
grant execute on function public.dt_revoke_trainer_link(uuid) to authenticated;

revoke all on function public.dt_reindex_sessions(uuid) from anon, authenticated;
revoke all on function public.dt_reindex_all_sessions() from anon, authenticated;
grant execute on function public.dt_reindex_sessions(uuid) to service_role;
grant execute on function public.dt_reindex_all_sessions() to service_role;

commit;
