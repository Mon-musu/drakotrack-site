# Esquema de Supabase

`app_data` (una fila por cuenta, `data jsonb`) sigue siendo la **fuente de verdad**
de todo lo que registra el alumno. Lo demás es índice de lectura, salvo `profiles`
y `trainer_links`, que son datos con vida propia.

## Perfiles y roles — `20261101_profiles.sql`

Un solo flujo de acceso para todos: correo y contraseña contra las rutas de
`/api/auth`. Ser entrenador **no** es otra cuenta ni otro login, es un valor en
`profiles`:

| Rol | Qué puede |
| --- | --- |
| `athlete` | sus propios datos; nada del panel |
| `trainer` | lo anterior, invitar alumnos, leer el índice de quien consintió |
| `admin` | lo anterior y leer todos los perfiles, cambiar roles |

La tabla `profiles` (`id`, `role`, `display_name`, `avatar_url`) se crea sola:
un trigger sobre `auth.users` la rellena para cada cuenta nueva y la migración
hace el backfill de las existentes. Borrar la cuenta arrastra el perfil.

### La recursión de RLS, resuelta

Una política de `profiles` que consulte `profiles` para saber el rol entra en
recursión infinita. La salida es una sola función, `SECURITY DEFINER`, que lee la
tabla como su dueño:

```sql
create function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'athlete');
$$;
```

Todas las políticas llaman a `current_role()`, nunca a `profiles`. Quien no tiene
fila todavía es `athlete`, no `null`.

### Nadie se asciende solo

- `authenticated` solo tiene `select` y `update (display_name, avatar_url)` sobre
  `profiles`. Un `PATCH` con `role` da **error de permisos**, no un no-op
  silencioso.
- El único camino que escribe el rol es `dt_admin_set_role(user_id, role)`, que
  exige que quien llama sea `admin` y se niega a dejar el sistema sin
  administradores (`last_admin`).
- Invitar a un alumno ensancha el rol del que invita de `athlete` a `trainer`.
  Nunca lo baja: un entrenador que además entrena sigue siendo entrenador.

### El primer admin

Aquí no hay código de bootstrap, y es a propósito. La API no guarda una
`service_role` key: todas las escrituras van con el token del usuario. Un código
de bootstrap tendría que sembrarse hasheado en una tabla, y sembrarlo exige el
SQL Editor igual que ascender al primer admin a mano. O sea: el token agrega
tabla, endpoint y campo en el login para ahorrar **cero** pasos manuales. Si el
titular no va a tener acceso al panel nunca, conviene el token y entonces
también conviene decidir dónde vive la clave de servicio; avisá y lo armamos.

Mientras tanto, una sola vez, en el SQL Editor o en el editor de tablas:

```sql
update public.profiles set role = 'admin' where id = 'UUID-DE-TU-CUENTA';
```

### El rol no va en el token

`safeUser()` en `lib/security.js` devuelve solo `id` y `email`, así que el rol
nunca entra en la cookie ni en la respuesta de sesión. No hay claim que esperar a
que caduque: cada consulta lee `profiles` a través de `current_role()`. Un rol
revocado deja de valer en el acto.

## Qué hay en `20261101_trainer_index.sql`

| Tabla | Qué guarda | ¿Se puede borrar? |
| --- | --- | --- |
| `session_index` | Una fila por sesión terminada: fecha, duración, volumen, series, repeticiones y `exercise_ids`. | Sí, se reconstruye desde `app_data`. |
| `training_plans` | Plan activo del alumno: sesiones planificadas por semana, inicio y fin. | Sí, es una copia del plan que prescribe el entrenador. |
| `trainer_links` | Vínculo alumno-entrenador, código de invitación, caducidad, consentimiento y revocación. | **No.** Es el único dato que no existe en el JSON. |

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
canjeando el código con `dt_redeem_trainer_invite()`: su consentimiento (`consented_at`) *es*
la fila que pasa a `active`. Cualquiera de las dos partes revoca con
`dt_revoke_trainer_link(id)`, y las políticas dejan de mostrar los datos al
instante porque exigen `status = 'active'` **y** `consented_at is not null`.

Los códigos son de 10 caracteres alfanuméricos, se generan con
`gen_random_uuid()`, son únicos, caducan a los 7 días (`invite_expires_at`) y
caducan al canjearse. Un código vencido no se puede canjear y la fila queda
`pending` para que el entrenador la cancele. Nada de esto dispara avisos: el
alumno recibe el código por fuera de la app, como hasta ahora. Fuera de esta
fase, a propósito: límite de intentos por cuenta y aviso al alumno cuando un
entrenador crea el vínculo (la fila `pending` es consultable por ambas partes,
pero no notifica).

### Grupos musculares

`session_index` guarda los ids estables de ejercicio (`exId`), no los grupos. La
correspondencia id → grupo vive en el catálogo del cliente
(`EXERCISE_CATALOG` en `app.js`). Duplicarla en SQL habría creado una segunda
fuente de verdad para un dato que ya existe; el panel resuelve los grupos con el
mismo catálogo que usa la app.

## Aplicar las migraciones

Ninguna está aplicada en producción todavía. Orden recomendado:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261101_profiles.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261101_trainer_index.sql
```

O pegando cada archivo completo en el **SQL Editor** del panel de Supabase. Cada
uno empieza con `begin;` y termina con `commit;`, así que se aplica entero o no
se aplica. Las dos se pueden reaplicar sin error.

Ojo con qué se pega: los dos renglones de arriba son comandos de terminal
(`psql …`), no SQL. Al SQL Editor va el **contenido** del archivo `.sql`
completo, desde `begin;` hasta `commit;`; pegar `psql "$SUPABASE_DB_URL" -f …`
ahí da un error de sintaxis, porque el editor ejecuta SQL y no entiende de
variables de entorno ni de banderas.


## Quitar el captcha ALTCHA

El captcha de registro se eliminó de la app. Sus dos funciones
(`altcha_register` y `altcha_consume`) se crearon a mano en el proyecto de
Supabase y nunca estuvieron en este repositorio, así que ésta es la única
migración pensada para aplicarse ya sobre la base en uso:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261102_drop_altcha.sql
```

Las busca por nombre y borra todas sus versiones, así que no hace falta conocer
la firma exacta; si ya no existen, no hace nada y se puede reaplicar. Sólo borra
funciones: la tabla interna donde se guardaban los retos, si existe, queda
intacta. El `.down.sql` vuelve a crear un equivalente funcional, para el caso de
volver a una versión de la app que todavía pida el captcha.

Pueden ir en cualquier orden: cada una toca la tabla de la otra solo dentro de un
bloque `do` guardado con `to_regclass`, y las dos crean la misma política
`profiles_linked_read`. Si aplicás `trainer_index` primero, volvé a correrlo
después de `profiles` para que la política de perfiles vinculados quede creada.
Un entrenador que ya tenía invitaciones antes de que existiera `profiles` no se
promueve solo; una línea lo arregla:

```sql
update public.profiles set role = 'trainer'
 where role = 'athlete'
   and id in (select trainer_id from public.trainer_links where status = 'active');
```

Después de aplicarla, y después de cualquier migración que toque `app_data`:

```bash
./scripts/reindex-sessions.sh            # todas las cuentas
./scripts/reindex-sessions.sh --user <uuid>   # una cuenta
```

## Revisión y escritura atómica — `20261104_app_data_revision.sql`

`app_data` sigue siendo la fuente de verdad, pero ya no se escribe con un
upsert. La migración agrega:

| Objeto | Para qué |
| --- | --- |
| `app_data.rev` | Revisión monótona por cuenta. Las filas existentes entran en `0`. |
| `app_data.last_op_id` | Identificador de la última operación aplicada. |
| `app_data_history` | Las **10** últimas versiones por cuenta (trigger, retención fija). |
| `dt_save_app_data(data, base_rev, op_id)` | Escritura condicional y atómica; `409` cuando la revisión no coincide. |
| `dt_delete_app_data()` | Borrado de la copia del usuario autenticado. |
| `dt_app_data_history(limit)` | Metadatos de las versiones recuperables de la propia cuenta. |
| `dt_restore_app_data(rev)` | Recupera una versión como revisión nueva. |

Todas las funciones son `SECURITY DEFINER`, derivan la cuenta de `auth.uid()`
(nunca de un parámetro) y fijan `search_path`. La comprobación de revisión y la
escritura ocurren en la misma transacción con `SELECT … FOR UPDATE`, así que dos
peticiones simultáneas se serializan: la segunda ve la revisión ya incrementada.

**Endurecimiento.** `authenticated` pierde `insert`, `update` y `delete` sobre
`app_data`; conserva `select` (con las políticas RLS existentes, que no se
tocan). La única puerta de escritura es `dt_save_app_data()`. Un `PATCH` directo
por PostgREST devuelve error de permisos en lugar de saltarse la revisión.

**Historial.** El trigger `app_data_archive` guarda la versión anterior antes de
reemplazarla y borra las que sobran: 10 por cuenta, sin crecer con el uso. Si la
cuenta se borra en cascada no se archiva nada, para no conservar datos de una
cuenta suprimida.

**Compatibilidad.** No se reescribe `data` ni se borran filas; el historial
arranca vacío. Un cliente anterior a este cambio sigue leyendo, pero sus
escrituras directas dejan de funcionar: al recargar la app usa la API nueva.

**Verificación.** El SQL está revisado y cubierto por pruebas en Node con un
servidor falso que aplica la misma regla (revisión, conflicto, reintento
idempotente), pero **no se ha ejecutado contra un Postgres real**: en este
entorno no hay base de datos ni credenciales. Aplicarlo primero en un proyecto de
prueba y correr `node test-backend.js signup` / `verify` con
`SUPABASE_PUBLISHABLE_KEY` es el paso que falta.

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
**85 comprobaciones** (45 del índice, 40 de perfiles y roles), incluidas la
ausencia de recursión en las políticas de `profiles`, el intento de autoascenso
por `PATCH`, el ascenso a `trainer` al invitar, la caducidad de invitaciones, el
límite del último admin, los dos órdenes de aplicación y la reversión completa de
las dos migraciones. **No se ha aplicado en el proyecto de producción**: eso
requiere ejecutarlo contra la base real.

## Cuándo normalizar de verdad

Cuando el entrenador necesite **escribir** sobre los datos del alumno, cuando el
JSON pase de unos cientos de KB por usuario, o cuando hagan falta reportes entre
usuarios que el índice no resuelva. Para entonces `session_index` ya dice qué
tan sucio está el JSON real, que es justo lo que hace falta para escribir la
migración sin adivinar.
