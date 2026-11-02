-- Versionado y escritura atómica del documento de entrenamiento.
--
-- Problema que resuelve: hasta ahora la API guardaba el documento completo con
-- un upsert (`Prefer: resolution=merge-duplicates`) y el navegador enviaba
-- siempre la copia entera. Dos dispositivos que editaban cosas distintas se
-- pisaban entre sí, y uno que llevaba días sin conexión podía borrar lo que el
-- otro acababa de registrar. No había forma de que el servidor notara que una
-- escritura venía de una versión vieja.
--
-- Qué agrega:
--   app_data.rev          revisión monótona por cuenta (0 en las filas actuales)
--   app_data.last_op_id   identificador de la última operación aplicada
--   app_data_history      últimas 10 versiones por cuenta (red de seguridad)
--   dt_save_app_data      escritura condicional y atómica: solo aplica si la
--                         revisión de la base coincide con la del dispositivo,
--                         y reconoce un reintento por op_id sin duplicar nada
--   dt_delete_app_data    borrado explícito de la copia (derecho de supresión)
--   dt_app_data_history   lista las versiones recuperables de la propia cuenta
--   dt_restore_app_data   recupera una versión anterior como revisión nueva
--
-- Endurecimiento: `authenticated` deja de poder escribir app_data directamente
-- por PostgREST. La única puerta de escritura es la función, que verifica la
-- revisión en la misma sentencia que guarda. Eso no debilita RLS: la lectura
-- sigue pasando por las políticas existentes y las funciones derivan la cuenta
-- de auth.uid(), nunca de un parámetro.
--
-- Compatible con los datos actuales: no toca `data`, no reescribe filas y las
-- columnas nuevas entran con valores por defecto seguros (rev = 0).

begin;

do $guard$
begin
  if to_regclass('public.app_data') is null then
    raise exception 'app_data_missing: crea la tabla public.app_data antes de aplicar esta migración';
  end if;
end
$guard$;

-- ------------------------------------------------------------------ columnas
alter table public.app_data add column if not exists rev bigint not null default 0;
alter table public.app_data add column if not exists last_op_id text;

comment on column public.app_data.rev is
  'Revisión del documento. Solo dt_save_app_data() y dt_restore_app_data() la incrementan.';
comment on column public.app_data.last_op_id is
  'Identificador de la última operación aplicada, para que un reintento no duplique una escritura.';

-- ------------------------------------------------------- historial acotado
create table if not exists public.app_data_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  rev bigint not null,
  data jsonb not null,
  saved_at timestamptz not null default now()
);

create index if not exists app_data_history_user_idx
  on public.app_data_history (user_id, id desc);

comment on table public.app_data_history is
  'Últimas 10 copias por cuenta, escritas por el trigger antes de reemplazar app_data. Retención fija: no crece con el uso.';

alter table public.app_data_history enable row level security;
-- Sin políticas: nadie lee la tabla directamente. El acceso pasa por
-- dt_app_data_history(), que filtra por auth.uid().
revoke all on table public.app_data_history from public;
revoke all on table public.app_data_history from anon, authenticated;

create or replace function public.dt_archive_app_data()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_data jsonb;
  v_rev bigint;
begin
  if tg_op = 'DELETE' then
    v_data := old.data;
    v_rev := old.rev;
  else
    if old.data is not distinct from new.data then
      return null;
    end if;
    v_data := old.data;
    v_rev := old.rev;
  end if;

  if v_data is null then
    return null;
  end if;

  -- Si la cuenta se está borrando en cascada, no se guarda nada: la copia de
  -- seguridad no puede sobrevivir al derecho de supresión.
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;

  insert into public.app_data_history (user_id, rev, data)
  values (old.user_id, v_rev, v_data);

  -- Retención: 10 por cuenta, las más recientes. El uso normal no llena nada
  -- porque cada guardado reemplaza a la más vieja.
  delete from public.app_data_history h
   where h.user_id = old.user_id
     and h.id not in (
       select keep.id from public.app_data_history keep
        where keep.user_id = old.user_id
        order by keep.id desc
        limit 10
     );

  return null;
end;
$fn$;

drop trigger if exists app_data_archive on public.app_data;
create trigger app_data_archive
  after update or delete on public.app_data
  for each row execute function public.dt_archive_app_data();

-- ------------------------------------------------- escritura condicional
create or replace function public.dt_save_app_data(
  p_data jsonb,
  p_base_rev bigint default null,
  p_op_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_last text;
  v_data jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_data' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 2097152 then
    raise exception 'payload_too_large' using errcode = '22001';
  end if;

  -- El bloqueo de fila serializa dos escrituras simultáneas: la segunda ve la
  -- revisión ya incrementada y no puede pisar a la primera.
  select a.rev, a.last_op_id, a.data into v_rev, v_last, v_data
    from public.app_data a
   where a.user_id = v_uid
     for update;

  if not found then
    insert into public.app_data (user_id, data, rev, last_op_id)
    values (v_uid, p_data, 1, p_op_id)
    on conflict (user_id) do nothing
    returning rev into v_rev;

    if v_rev is null then
      -- Otra petición insertó primero: se responde conflicto con su revisión.
      select a.rev into v_rev from public.app_data a where a.user_id = v_uid;
      return jsonb_build_object('ok', false, 'rev', coalesce(v_rev, 0), 'reason', 'conflict');
    end if;
    return jsonb_build_object('ok', true, 'rev', v_rev, 'replay', false);
  end if;

  -- Reintento de una operación que ya se aplicó (se cortó la red después de
  -- guardar, por ejemplo): se confirma sin volver a escribir ni duplicar.
  -- Mismo identificador de operación y mismo contenido: es el reintento de
  -- una escritura que sí se aplicó. Si coincidiera el id pero no el contenido,
  -- no es un reintento y se trata como una escritura normal.
  if p_op_id is not null and v_last is not null and p_op_id = v_last and p_data = v_data then
    return jsonb_build_object('ok', true, 'rev', v_rev, 'replay', true);
  end if;

  if p_base_rev is null or p_base_rev <> v_rev then
    return jsonb_build_object('ok', false, 'rev', v_rev, 'reason', 'conflict');
  end if;

  update public.app_data
     set data = p_data,
         rev = v_rev + 1,
         last_op_id = p_op_id
   where user_id = v_uid;

  return jsonb_build_object('ok', true, 'rev', v_rev + 1, 'replay', false);
end;
$fn$;

comment on function public.dt_save_app_data(jsonb, bigint, text) is
  'Guardado con control de concurrencia optimista. Devuelve {ok, rev, replay} o {ok:false, rev, reason:"conflict"} sin escribir.';

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
  delete from public.app_data where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$fn$;

comment on function public.dt_delete_app_data() is
  'Borra la copia del usuario autenticado. El trigger deja antes una versión en el historial acotado.';

-- ------------------------------------------------------- recuperar versiones
create or replace function public.dt_app_data_history(p_limit int default 10)
returns table (rev bigint, saved_at timestamptz, bytes int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
    select h.rev,
           h.saved_at,
           octet_length(h.data::text)::int
      from public.app_data_history h
     where h.user_id = v_uid
     order by h.id desc
     limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$fn$;

create or replace function public.dt_restore_app_data(p_rev bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_data jsonb;
  v_new bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.data into v_data
    from public.app_data_history h
   where h.user_id = v_uid
     and h.rev = p_rev
   order by h.id desc
   limit 1;

  if v_data is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.app_data
     set data = v_data,
         rev = rev + 1,
         last_op_id = null
   where user_id = v_uid
  returning rev into v_new;

  if v_new is null then
    return jsonb_build_object('ok', false, 'reason', 'no_data');
  end if;

  return jsonb_build_object('ok', true, 'rev', v_new, 'restored', p_rev);
end;
$fn$;

comment on function public.dt_restore_app_data(bigint) is
  'Recupera una versión del historial como revisión nueva. El resto de dispositivos la recibe como cambio y se combina sin pisar nada.';

-- ------------------------------------------------------------- permisos
revoke all on function public.dt_archive_app_data() from public;
revoke all on function public.dt_save_app_data(jsonb, bigint, text) from public;
revoke all on function public.dt_delete_app_data() from public;
revoke all on function public.dt_app_data_history(int) from public;
revoke all on function public.dt_restore_app_data(bigint) from public;

revoke all on function public.dt_save_app_data(jsonb, bigint, text) from anon;
revoke all on function public.dt_delete_app_data() from anon;
revoke all on function public.dt_app_data_history(int) from anon;
revoke all on function public.dt_restore_app_data(bigint) from anon;

grant execute on function public.dt_save_app_data(jsonb, bigint, text) to authenticated;
grant execute on function public.dt_delete_app_data() to authenticated;
grant execute on function public.dt_app_data_history(int) to authenticated;
grant execute on function public.dt_restore_app_data(bigint) to authenticated;

-- Única puerta de escritura: la función de arriba. La lectura sigue con RLS.
revoke insert, update, delete on table public.app_data from public;
revoke insert, update, delete on table public.app_data from anon, authenticated;
grant select on table public.app_data to authenticated;

commit;
