-- Profiles: one login for everyone, and the role as data.
--
-- There is a single authentication flow (email + password through the existing
-- /api/auth routes). Being a trainer is not another account and not another
-- login: it is a value in this table, so a trainee can start coaching and a
-- trainer can keep training with the same user.
--
-- Additive and idempotent, and it can be applied before or after
-- 20261101_trainer_index.sql: that one widens the role to 'trainer' when
-- someone mints an invitation and adds the trainer's read access to profiles,
-- both guarded on this table existing.
--
-- Deliberately absent: the role as a JWT claim. Claims live until the token
-- expires, so a revoked role would stay usable for up to an hour. Everything
-- reads the role from this table through current_role() instead.

begin;

-- ------------------------------------------------------------------ table
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'athlete' check (role in ('athlete', 'trainer', 'admin')),
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per account. The role lives here, never in a token claim, so it can be revoked immediately.';
comment on column public.profiles.role is
  'athlete, trainer or admin. Only dt_admin_set_role() changes it; nobody can widen their own role.';

create index if not exists profiles_role_idx
  on public.profiles (role) where role <> 'athlete';

-- ------------------------------------------------------------------ lifecycle
-- Every new account gets a profile, including accounts created by the auth
-- service itself, so no code path has to remember to create one.
create or replace function public.dt_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.dt_create_profile();

-- Existing accounts: backfill before the trigger starts firing.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

create or replace function public.dt_touch_profile()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.dt_touch_profile();

-- ------------------------------------------------------------------ role
-- Reading the role must not go through RLS on the same table that the policy
-- is protecting, or the policy would call itself forever. This function is the
-- single hop that breaks that recursion: SECURITY DEFINER reads the table as
-- its owner, and every policy calls it instead of querying profiles.
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'athlete');
$fn$;

comment on function public.current_role() is
  'Role of the signed-in user, read from profiles. Used by RLS policies so they never query profiles recursively.';

-- The only path that writes the role. A trainer cannot promote anybody, an
-- admin cannot demote themselves out of a system with a single admin, and an
-- admin cannot invent a role the check constraint would reject anyway.
create or replace function public.dt_admin_set_role(p_user_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_previous text;
  v_admins int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.current_role() <> 'admin' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_role not in ('athlete', 'trainer', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select p.role into v_previous from public.profiles p where p.id = p_user_id;
  if v_previous is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if v_role <> 'admin' and v_previous = 'admin' then
    select count(*) into v_admins from public.profiles p where p.role = 'admin';
    if v_admins <= 1 then
      raise exception 'last_admin' using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = v_role where id = p_user_id;
  return v_role;
end;
$fn$;

comment on function public.dt_admin_set_role(uuid, text) is
  'Promotes or demotes a profile. The last remaining admin cannot be demoted, so the system never locks itself out.';

-- ------------------------------------------------------------------ access
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column grants, not a table-wide update: even an owned row cannot rewrite
-- role, created_at or id. PATCHing role returns a permission error.
grant update (display_name, avatar_url) on table public.profiles to authenticated;

-- Own row, or any row when the caller is an admin. The trainer side (a
-- trainer reading the profile of a trainee they are linked to) is added by
-- 20261101_trainer_index.sql, which owns the consent rules.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_role() = 'admin');

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- The linked-profile read policy lives in both migrations, each one guarded on
-- the other's table, so the two files apply in either order and still end up
-- with the same policies. Applying both is idempotent.
do $do$
begin
  if to_regclass('public.trainer_links') is not null then
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

-- No insert or delete policy: rows are created by the trigger and removed by
-- the cascade from auth.users. Deleting an account does not leave a profile
-- behind, and nobody can fabricate a profile for someone else.

revoke all on function public.dt_create_profile() from public;
revoke all on function public.dt_touch_profile() from public;
revoke all on function public.current_role() from public;
revoke all on function public.dt_admin_set_role(uuid, text) from public;

grant execute on function public.current_role() to authenticated;
grant execute on function public.dt_admin_set_role(uuid, text) to authenticated;

commit;
