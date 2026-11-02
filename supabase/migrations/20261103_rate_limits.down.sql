-- Revierte 20261103_rate_limits.sql.
revoke all on function public.rate_limit_hit(text, integer, integer) from service_role;
drop function if exists public.rate_limit_hit(text, integer, integer);
drop table if exists public.rate_limits;
