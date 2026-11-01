-- Reverts 20261101_profiles.sql.
--
-- Dropping profiles discards roles and display names. Accounts, app_data and
-- trainer links are untouched; the trainer index migration does not depend on
-- this table (it only widens the role when the table exists).
--
-- The table goes first: its policies reference current_role(), so the function
-- cannot be dropped while the policies still exist.

begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.profiles;

drop function if exists public.dt_admin_set_role(uuid, text);
drop function if exists public.current_role();
drop function if exists public.dt_touch_profile();
drop function if exists public.dt_create_profile();

commit;
