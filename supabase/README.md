# Esquema de Supabase

`app_data` (una fila por cuenta, `data jsonb`) sigue siendo la **fuente de verdad**
de todo lo que registra el alumno. Lo demás es índice de lectura.

## Qué hay en `20261101_trainer_index.sql`

| Tabla | Qué guarda | ¿Se puede borrar? |
| --- | --- | --- |
| `session_index` | Una fila por sesión terminada: fecha, duración, volumen, series, repeticiones y `exercise_ids`. | Sí, se reconstruye desde `app_data`. |
| `training_plans` | Plan activo del alumno: sesiones planificadas por semana, inicio y fin. | Sí, es una copia del plan que prescribe el entrenador. |
| `trainer_links` | Vínculo alumno-entrenador, código de invitación, aceptación y revocación. | **No.** Es el único dato que no existe en el JSON. |

### El invariante

`session_index` **nunca** es autoridad. Si discrepa de `app_data`, gana `app_data`
y el índice se reconstruye. Nadie escribe en `session_index` a mano: lo llena un
trigger en la misma transacción que guarda `app_data`, o lo reescriben las
funciones de reindexado. Si alguna vez hay en el índice una sesión que no está en
el JSON, el modelo está roto.

El trigger es `SECURITY DEFINER`, así que escribe saltándose RLS. Si falla,
deja un `WARNING` y **no** cancela el guardado: la sesión se guarda igual y el
reindexado repara el hueco.

### Consentimiento

Un entrenador solo ve `session_index` y `training_plans` de quien tiene un
`trainer_links` en estado `active`. Ese estado solo lo puede poner el alumno
canjeando el código con `dt_redeem_trainer_invite()`: su aceptación *es* el
consentimiento. Cualquiera de las dos partes revoca con
`dt_revoke_trainer_link(id)`, y las políticas dejan de mostrar los datos al
instante porque exigen `status = 'active'`.

Los códigos de invitación son de 10 caracteres alfanuméricos, se generan con
`gen_random_uuid()`, son únicos y caducan al canjearse. Fuera de esta fase, a
propósito: caducidad por tiempo, límite de intentos por cuenta y aviso al alumno
cuando un entrenador crea el vínculo (la fila `pending` es consultable por
ambas partes, pero no dispara nada).

### Grupos musculares

`session_index` guarda los ids estables de ejercicio (`exId`), no los grupos. La
correspondencia id → grupo vive en el catálogo del cliente
(`EXERCISE_CATALOG` en `app.js`). Duplicarla en SQL habría creado una segunda
fuente de verdad para un dato que ya existe; el panel resuelve los grupos con el
mismo catálogo que usa la app.

## Aplicar la migración

No está aplicada en producción todavía. Dos formas:

```bash
# Con una cadena de conexión de Postgres del proyecto (Settings → Database)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261101_trainer_index.sql
```

O pegando el archivo completo en el **SQL Editor** del panel de Supabase. El
archivo empieza con `begin;` y termina con `commit;`, así que se aplica entero o
no se aplica.

Después de aplicarla, y después de cualquier migración que toque `app_data`:

```bash
./scripts/reindex-sessions.sh            # todas las cuentas
./scripts/reindex-sessions.sh --user <uuid>   # una cuenta
```

## Comprobar que el índice cuadra

```sql
-- Debe devolver 0 filas: ninguna sesión indexada sin sesión en app_data
select si.*
  from public.session_index si
  join public.app_data a on a.user_id = si.user_id
 where not exists (
   select 1 from jsonb_array_elements(coalesce(a.data->'sessions', '[]'::jsonb)) s
    where s->>'id' = si.session_id
 );

-- Y el recuento por cuenta debe coincidir con el JSON
select a.user_id,
       (select count(*) from jsonb_array_elements(coalesce(a.data->'sessions', '[]'::jsonb)) s
         where coalesce(s->'finished', 'false'::jsonb) = 'true'::jsonb) as en_json,
       (select count(*) from public.session_index si where si.user_id = a.user_id) as en_indice
  from public.app_data a;
```

El hash por fila (`source_hash`) permite que el reindexado reescriba solo lo que
cambió, en lugar de reinsertar todo el histórico de cada cuenta.

## Verificación

El SQL se probó sobre un PostgreSQL real en WASM (PGlite) con un `app_data`,
roles `anon`/`authenticated` y un `auth.uid()` equivalentes a los de Supabase:
41 comprobaciones de trigger, RLS, invitaciones, revocación y reindexado, más la
reaplicación idempotente y la reversión completa. **No se ha aplicado en el
proyecto de producción**: eso requiere ejecutarlo contra la base real.

## Cuándo normalizar de verdad

Cuando el entrenador necesite **escribir** sobre los datos del alumno, cuando el
JSON pase de unos cientos de KB por usuario, o cuando hagan falta reportes entre
usuarios que el índice no resuelva. Para entonces `session_index` ya dice qué
tan sucio está el JSON real, que es justo lo que hace falta para escribir la
migración sin adivinar.
