# Cine semanal

App web privada para reemplazar un Excel compartido de peliculas vistas, notas individuales, pendientes y recomendaciones semanales para un grupo cerrado.

## Lo que incluye la app ahora mismo

- Dashboard con tanda semanal de 3 peliculas y seleccion destacada; hasta 5 sugerencias en Pendientes.
- Vista de `Vistas` con peliculas ya vistas y notas por persona.
- Ficha detallada de pelicula con notas del grupo.
- Lista de `Pendientes` para guardar candidatas fuera de la tanda semanal.
- Busqueda libre en TMDb con caratulas y metadatos.
- Descubrimiento bajo demanda en Explorar, con regeneración de propuestas.
- Login por usuario y contrasena.
- Perfil propio editable y perfiles del grupo en solo lectura.
- Reset de emergencia por codigo de administracion en `/reset-credenciales`.
- Capa de recomendacion hibrida basada en historial, afinidad y variedad.
- Persistencia local para desarrollo y snapshot persistente en PostgreSQL con Prisma para despliegue.
- Sesiones firmadas en cookie para no depender de IDs de usuario en claro.

## Stack

- Next.js + TypeScript
- PostgreSQL via Prisma
- TMDb como fuente externa para busquedas, posters y enriquecimiento de metadatos
- Vitest para pruebas de reglas
- Playwright para pruebas E2E en escritorio y móvil

## Desarrollo local

1. Instala Node.js 24.x.
2. Copia `.env.example` a `.env.local`.
3. Rellena `TMDB_API_KEY`.
4. Instala dependencias con `npm ci`.
5. Arranca con `npm run dev`.

Por defecto, `DATABASE_URL` queda vacío y la app funciona con `data/runtime-state.json`. Puedes definir
`APP_DATA_DIR` para guardar el estado local en otro directorio, algo especialmente útil para pruebas aisladas.
El desarrollo bloquea cualquier base remota. Si necesitas una base remota exclusiva de desarrollo, debes indicar
simultáneamente `DATABASE_ENVIRONMENT=development` y `ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT=true`.

Las mutaciones adquieren un bloqueo transaccional compartido en PostgreSQL **antes de leer el estado**.
La lectura, la validación, las escrituras relacionadas y el snapshot se ejecutan en la misma transacción,
también entre instancias distintas de Vercel. Esto evita perder notas o actividad, sobrescribir una
contraseña al editar el perfil y dejar una película simultáneamente en Pendientes y Vistas. Si dos
peticiones modifican el mismo campo, prevalece la última operación confirmada.
El bloqueo se libera tanto al confirmar como al deshacer la transacción; las consultas a TMDb se hacen
fuera del bloqueo. No requiere cambios de esquema. Sin base de datos se usa una cola dentro del proceso
y reemplazo atómico del archivo: este modo local está pensado para **una sola instancia** de la app.
La caché solo se publica después de que la persistencia durable haya terminado correctamente.

## Pruebas

```bash
npm test
npm run lint
npm run build
npm run test:security
```

`tests/store-concurrency.test.ts` comprueba peticiones simultáneas sobre notas, listas y credenciales.
El workflow de Preview repite estas pruebas con dos módulos de la app independientes y PostgreSQL 16
en un contenedor desechable. Para ejecutarlas manualmente, provisiona el esquema con `prisma db push`
y define `CONCURRENCY_DATABASE_URL` apuntando a una base local llamada `cine_concurrency_test`.
La suite vacía las tablas de esa base entre casos y rechaza cualquier host remoto u otro nombre de base.

Los E2E se pueden ejecutar contra una Preview ya desplegada sin guardar credenciales en el repositorio:

```powershell
$env:E2E_BASE_URL="https://tu-preview.vercel.app"
$env:E2E_USERNAME="usuario_de_pruebas"
$env:E2E_PASSWORD="contrasena_de_pruebas"
$env:VERCEL_AUTOMATION_BYPASS_SECRET="bypass_de_automatizacion"
npm run test:e2e
```

La suite comprueba login público, sesión autenticada, peso del HTML de Grupo, ausencia de avatares base64,
deduplicación de TMDb y navegación móvil. Si no se define `E2E_BASE_URL`, Playwright intenta arrancar la app
localmente en `127.0.0.1:3000`.

`test:security` requiere el build previo y arranca su propia instancia local con datos y credenciales
ficticias en un directorio temporal. Comprueba permisos, ausencia de hashes en HTML/RSC y revocación
de sesiones en páginas y API tras cambios de contraseña, gestión administrativa y reset de emergencia.
Nunca se conecta a una base remota. Los E2E autenticados utilizan el login real con
`E2E_USERNAME` y `E2E_PASSWORD`; ya no se admiten cookies fabricadas solo con un ID de usuario.

El override de `deepmerge-ts` a 8.0.0 está limitado a `@prisma/config` para cubrir
GHSA-ggr8-5vv4-36mx mientras Prisma 6 mantenga su dependencia anterior. La aplicación utiliza
`schema.prisma` sin configuración TypeScript personalizada. Verificar `prisma generate`, build
y pruebas al actualizar este override o Prisma.

## Diagnóstico y copias de seguridad

Las herramientas de base de datos exigen declarar el entorno de forma explícita. Se puede proporcionar un
archivo aislado mediante `--env-file`; sus valores deben incluir como mínimo `DATABASE_URL` y, preferiblemente,
`APP_ENV`, `DATABASE_ENVIRONMENT` y `PRODUCTION_DATABASE_HOST`.

```powershell
npm run db:health -- --environment=preview --env-file=.env.preview.local
npm run db:checkpoint -- --environment=preview --env-file=.env.preview.local --label=antes-de-un-cambio
npm run db:export -- --environment=preview --env-file=.env.preview.local
npm run db:verify-backup -- --file=data/database-export-preview-FECHA.json
npm run db:restore -- --dry-run --environment=preview --env-file=.env.preview.local --file=data/database-export-preview-FECHA.json
```

- `db:health` solo lee y comprueba huérfanos, duplicados, notas inválidas, solapamientos, tandas incoherentes,
  fechas y calidad mínima de metadatos. Devuelve código `2` cuando encuentra errores estructurales.
- `db:checkpoint` crea un punto de guardado completo, lo escribe primero como archivo temporal, comprueba su
  checksum y el host de origen y solo entonces lo publica con su nombre definitivo. Nunca sobrescribe una copia
  existente. Si detecta errores conserva el archivo para diagnóstico, pero termina con código `2`.
- `db:export` solo lee y crea un JSON local con checksum SHA-256. Los exports dentro de `data` quedan ignorados
  por Git. El archivo contiene hashes de credenciales y debe tratarse como información privada.
- `db:verify-backup` comprueba formato, checksum e integridad interna sin conectarse a ninguna base.
- `db:restore` únicamente admite `--dry-run`: compara el backup con su mismo entorno y host, muestra las
  diferencias de volumen y nunca escribe filas. La restauración real permanece deshabilitada intencionadamente.

## Puntos de guardado y recuperación

Producción utiliza tres niveles complementarios:

1. Neon conserva siete días de historial para restauración instantánea y consultas Time Travel.
2. Neon crea snapshots diarios a las 00:00 UTC, conserva los diarios durante 14 días, el snapshot de cada lunes
   durante 5 semanas y el del primer día de cada mes durante 1 mes.
3. Antes de cualquier reparación, migración o cambio delicado se crea un checkpoint independiente:

```powershell
npm run db:checkpoint -- --environment=production --env-file=.env.local --label=antes-de-la-operacion
```

Los checkpoints contienen datos privados y hashes de credenciales. Permanecen fuera de Git y deben copiarse a
almacenamiento privado si se quiere una copia externa a Neon y al ordenador local.

En una incidencia:

1. Detén las escrituras y anota la hora aproximada del problema.
2. En Neon, usa `Backup & Restore` y `Preview data` para localizar un estado correcto sin modificar Producción.
3. Prefiere restaurar o inspeccionar primero una rama temporal. Solo después confirma la restauración de `main`.
4. Ejecuta `db:health`, verifica los recuentos y completa un flujo funcional en la aplicación.
5. Crea un checkpoint nuevo tras confirmar la recuperación.

El snapshot agregado de la aplicación no sustituye estas copias y nunca repuebla automáticamente las tablas
normalizadas.

## Verificación del despliegue

Cada despliegue expone una identidad de solo lectura en `/api/version` con el commit, la rama y el entorno
servidos realmente. Se puede contrastar un dominio con un commit concreto mediante:

```powershell
npm run deploy:verify -- --url=https://cine-semanal.vercel.app --expected-commit=SHA --expected-ref=main --expected-environment=production
```

Vercel construye y despliega automáticamente los cambios de `main` mediante su integración con GitHub.
El workflow `Verify production deployment` espera ese despliegue y comprueba que el dominio de Producción
sirve exactamente el SHA fusionado, la rama `main` y el entorno `production`.

El workflow `Daily production health` se ejecuta cada mañana y también puede lanzarse manualmente. Verifica
el SHA desplegado y consulta `/api/health`, que comprueba la conexión con Neon, los recuentos principales,
notas fuera de incrementos de 0,25, registros huérfanos y películas simultáneamente pendientes y vistas.
La ruta solo acepta el secreto `HEALTHCHECK_SECRET`, compartido con
`PRODUCTION_HEALTHCHECK_SECRET` en GitHub, y nunca devuelve credenciales ni datos personales.

## Accesos del grupo

- Las cuentas del grupo ya no dependen de credenciales semilla dentro del código.
- Si una cuenta pierde acceso, usa el reset de emergencia o la gestión de acceso desde una cuenta administradora.
- En una instalación local nueva, configura `ADMIN_RESET_CODE` y asigna una contraseña a la cuenta inicial
  desde `/reset-credenciales`. El reset recupera credenciales, pero no concede permisos administrativos.
- El rol de administrador depende exclusivamente de `UserRecord.isAdmin` (o `isAdmin` en el estado local).
  La primera asignación debe realizarse explícitamente por quien administra los datos. Cambiar el nombre,
  el usuario o coincidir con una identidad histórica nunca concede permisos.
- Solo se envían campos públicos de perfil a los componentes cliente; los hashes permanecen en el servidor.
- Las sesiones v2 están vinculadas a las credenciales actuales mediante HMAC, sin incluir el hash de
  contraseña en la cookie. Cambiar o restablecer la contraseña revoca las sesiones anteriores; un cambio
  desde el perfil renueva únicamente la sesión del navegador que lo solicita. El servidor comprueba las
  credenciales actuales en cada petición protegida, sin cachés de autenticación entre peticiones.
- Al desplegar por primera vez sesiones v2, todos los miembros deben volver a iniciar sesión. No hay cambios
  de esquema ni migración de datos para esta actualización.

## Preparar despliegue en Vercel + PostgreSQL

Usa bases físicamente independientes para Preview y Producción. No basta con cambiar `APP_SNAPSHOT_ID`: las
tablas normalizadas también contienen datos compartidos.

1. Crea una base PostgreSQL exclusiva para Preview y otra exclusiva para Producción.
2. Obtén para cada una:
   - `DATABASE_URL`: conexión pooler de runtime.
   - `DIRECT_URL`: conexión directa para Prisma CLI.
3. Anota únicamente el hostname de `DATABASE_URL` de Producción, sin usuario, contraseña ni puerto. Ese valor
   será `PRODUCTION_DATABASE_HOST` en ambos entornos desplegados.
4. En Vercel configura las variables por ámbito, nunca para todos los entornos a la vez:

| Variable | Preview | Production |
| --- | --- | --- |
| `APP_ENV` | `preview` | `production` |
| `DATABASE_ENVIRONMENT` | `preview` | `production` |
| `DATABASE_URL` | URL de Preview | URL de Producción |
| `DIRECT_URL` | URL directa de Preview | URL directa de Producción |
| `PRODUCTION_DATABASE_HOST` | Host de Producción | Host de Producción |
| `APP_SNAPSHOT_ID` | `main` | `main` |
| `SESSION_SECRET` | secreto exclusivo de Preview | secreto exclusivo de Producción |
| `ADMIN_RESET_CODE` | código exclusivo de Preview | código exclusivo de Producción |
| `TMDB_API_KEY` | clave correspondiente | clave correspondiente |
| `HEALTHCHECK_SECRET` | opcional | secreto exclusivo del monitor diario |

La aplicación se niega a usar una base `production` desde Preview, exige que Producción coincida con el host
declarado y rechaza configuraciones contradictorias entre `APP_ENV` y `VERCEL_ENV`.

5. Aplica el esquema y el seed primero en Preview. El seed exige una confirmación explícita:

```bash
CONFIRM_DATABASE_SEED=preview npm run db:seed
```

En PowerShell:

```powershell
$env:CONFIRM_DATABASE_SEED="preview"
npm run db:seed
```

6. Valida Preview y solo entonces repite migración/seed para Producción, usando
   `CONFIRM_DATABASE_SEED=production`.
7. Sube el repo a GitHub y despliega.

`npm run db:seed` vuelca vuestro estado actual de `data/runtime-state.json` a `AppSnapshot` y a las tablas normalizadas de usuarios, películas, notas, vistas, pendientes y recomendaciones. Después del seed, las tablas normalizadas son la única fuente de verdad para esas colecciones.

`AppSnapshot` conserva únicamente el contexto agregado de la aplicación, como el grupo y la actividad reciente. Una colección normalizada vacía se considera un estado válido y nunca se rellena automáticamente desde un snapshot antiguo. Cualquier recuperación desde snapshot debe hacerse mediante una operación administrativa explícita, con copia de seguridad previa.

Cuando cambie el esquema de Prisma, aplica primero la estructura en la base y después siembra los datos:

```bash
npx prisma db push
npm run db:seed
```

Con Prisma, usa `DATABASE_URL` para runtime con pooler y `DIRECT_URL` para operaciones de esquema mediante
conexión directa. Las plantillas completas están en `.env.example`, `.env.preview.example` y
`.env.production.example`.

## Notas de implementacion

- La importacion desde Excel ya no forma parte de la interfaz: el historico del grupo esta cargado manualmente en el estado inicial.
- La persistencia remota conserva un snapshot JSON compacto para contexto agregado, pero usuarios, películas, notas, vistas, pendientes y recomendaciones proceden siempre de sus tablas normalizadas.
- El snapshot no puede repoblar ni sobrescribir automáticamente una tabla normalizada, aunque esa tabla esté vacía.
- Esto evita resucitar datos eliminados y permite arrancar desde las tablas normalizadas aunque el snapshot falte o esté desactualizado.
- Si el snapshot no existe se utiliza el contexto inicial del grupo sin actividad histórica, y se leen
  las tablas incluso si están vacías. Un fallo de consulta o un snapshot malformado bloquean la lectura en
  Preview/Producción en lugar de sustituir datos por el estado inicial.
- Si no existe `TMDB_API_KEY`, la app sigue funcionando, pero no podra enriquecer peliculas ni mostrar caratulas reales.
- En produccion deberias configurar siempre `SESSION_SECRET` con una cadena larga, aleatoria y privada.
- La nota externa muestra la fuente real disponible; Rotten Tomatoes se trata como preferencia, no como dependencia obligatoria.

## Endpoints principales

- `POST /api/auth/login`
- `GET /api/movies/search?q=...`
- `GET /api/movies/discover?generation=...&exclude=...`
- `POST /api/weekly-recommendations/generate`
- `POST /api/weekly-recommendations/select`
- `POST /api/pending/add`
- `POST /api/pending/remove`
- `POST /api/watch/mark-watched`
- `POST /api/profile/update`
- `POST /api/ratings/create-or-update`
- `GET /api/history/list`
- `GET /api/health` (privado, monitorización operativa)
