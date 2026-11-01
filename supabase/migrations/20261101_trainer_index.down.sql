-- Reverts 20261101_trainer_index.sql.
--
-- session_index and training_plans go away with no data loss for the athlete:
-- they are rebuilt from app_data. trainer_links is the only table here whose
-- rows are not derived, so revoking a link in this file destroys real data and
-- should be a deliberate decision.

begin;

drop trigger if exists app_data_session_index on public.app_data;

drop function if exists public.dt_reindex_all_sessions();
drop function if exists public.dt_reindex_sessions(uuid);
drop function if exists public.dt_session_rows(jsonb);
drop function if exists public.dt_revoke_trainer_link(uuid);
drop function if exists public.dt_redeem_trainer_invite(text);
drop function if exists public.dt_create_trainer_invite();
drop function if exists public.dt_sync_session_index();

drop table if exists public.session_index;
drop table if exists public.training_plans;
drop table if exists public.trainer_links;

drop function if exists public.dt_safe_num(text);
drop function if exists public.dt_safe_date(text);

commit;
