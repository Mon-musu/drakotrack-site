-- Rate limiting compartido entre instancias.
-- La tabla no es accesible desde el cliente: RLS activo, sin políticas, y el
-- único acceso es la función SECURITY DEFINER, concedida solo a service_role.
-- El servidor llama a rate_limit_hit con la clave secreta y un cubo ya hasheado:
-- no se guardan IPs, correos ni identificadores en claro.

create table if not exists public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits integer not null default 0
);

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_window integer, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200
     or p_window is null or p_window < 1 or p_window > 86400
     or p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid_rate_limit_arguments' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);

  insert into public.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket) do update
    set hits = case when rl.window_start = excluded.window_start then rl.hits + 1 else 1 end,
        window_start = excluded.window_start
  returning rl.hits, rl.window_start into v_hits, v_window_start;

  -- Limpieza barata y poco frecuente: evita que la tabla crezca sin límite.
  if random() < 0.01 then
    delete from public.rate_limits
     where ctid in (
       select ctid from public.rate_limits
        where window_start < now() - interval '1 day'
        limit 200
     );
  end if;

  return jsonb_build_object(
    'hits', v_hits,
    'reset_in', greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window) - now()))))::integer
  );
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
