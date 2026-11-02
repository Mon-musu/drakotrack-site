-- Reversión de 20261104_app_data_revision.sql.
-- Devuelve las escrituras directas por PostgREST y elimina el historial.
-- Los datos de app_data no se tocan: solo se pierden las revisiones antiguas.

begin;

grant insert, update, delete on table public.app_data to authenticated;

drop function if exists public.dt_restore_app_data(bigint);
drop function if exists public.dt_app_data_history(int);
drop function if exists public.dt_delete_app_data();
drop function if exists public.dt_save_app_data(jsonb, bigint, text);
drop function if exists public.dt_archive_app_data();

drop trigger if exists app_data_archive on public.app_data;
drop table if exists public.app_data_history;

alter table public.app_data drop column if exists last_op_id;
alter table public.app_data drop column if exists rev;

commit;
