-- Removes the ALTCHA captcha RPCs.
--
-- The signup captcha was removed from the app: /api/auth/challenge no longer
-- exists and nothing calls these functions. They were created by hand in the
-- Supabase project and never committed, so their exact signatures are not
-- known here; this migration drops every overload found in the public schema
-- instead of assuming an argument list.
--
-- Only objects of the removed feature are dropped. Tables, policies and rows of
-- app_data are untouched, and the migration is safe to run more than once: it
-- does nothing when the functions are already gone.
--
-- The functions were granted to `anon`; dropping them removes those grants too.

begin;

do $$
declare
  fn record;
begin
  for fn in
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('altcha_register', 'altcha_consume')
  loop
    execute format('drop function if exists public.%I(%s)', fn.name, fn.args);
    raise notice 'dropped public.%(%)', fn.name, fn.args;
  end loop;
end
$$;

commit;
