-- El borrado de la copia de entrenamiento debe ser real.
--
-- dt_delete_app_data() borraba app_data, pero el trigger de archivo guardaba
-- antes una copia en app_data_history. La UI decía "borrar mis datos" y el
-- historial seguía conservando hasta 10 versiones (incluida la foto). Esta
-- migración elimina también esas copias y deja la función como única puerta de
-- borrado. Es idempotente y no toca la cuenta de authentication.

begin;

create or replace function public.dt_delete_app_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Primero app_data: su trigger puede archivar la versión anterior. Después
  -- se borra el historial completo para que no quede ninguna copia recuperable.
  delete from public.app_data where user_id = v_uid;

  if to_regclass('public.app_data_history') is not null then
    delete from public.app_data_history where user_id = v_uid;
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

comment on function public.dt_delete_app_data() is
  'Borra app_data y todo su historial recuperable del usuario autenticado. No deja copias en app_data_history.';

revoke all on function public.dt_delete_app_data() from public, anon, authenticated;
grant execute on function public.dt_delete_app_data() to authenticated;

commit;
