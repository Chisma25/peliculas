# Cine semanal

App web privada para reemplazar un Excel compartido de peliculas vistas, notas individuales, pendientes y recomendaciones semanales para un grupo cerrado.

## Lo que incluye la app ahora mismo

- Dashboard con tanda semanal de 5 peliculas y seleccion destacada.
- Vista de `Vistas` con peliculas ya vistas y notas por persona.
- Ficha detallada de pelicula con notas del grupo.
- Lista de `Pendientes` para guardar candidatas fuera de la tanda semanal.
- Busqueda libre en TMDb con caratulas y metadatos.
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

1. Instala Node.js 20 o superior.
2. Copia `.env.example` a `.env.local`.
3. Rellena `TMDB_API_KEY`.
4. Instala dependencias con `npm ci`.
5. Arranca con `npm run dev`.

Por defecto, `DATABASE_URL` queda vacío y la app funciona con `data/runtime-state.json`. Puedes definir
`APP_DATA_DIR` para guardar el estado local en otro directorio, algo especialmente útil para pruebas aisladas.
El desarrollo bloquea cualquier base remota. Si necesitas una base remota exclusiva de desarrollo, debes indicar
simultáneamente `DATABASE_ENVIRONMENT=development` y `ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT=true`.

Las mutaciones se confirman de forma atómica: con PostgreSQL, las escrituras relacionadas y el snapshot se
ejecutan en una única transacción; sin base de datos, el archivo local se reemplaza atómicamente. La caché solo
se publica después de que la persistencia durable haya terminado correctamente.

## Pruebas

```bash
npm test
npm run lint
npm run build
```

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

## Accesos del grupo

- Las cuentas del grupo ya no dependen de credenciales semilla dentro del código.
- Si una cuenta pierde acceso, usa el reset de emergencia o la gestión de acceso desde una cuenta administradora.

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
- Si no existe `TMDB_API_KEY`, la app sigue funcionando, pero no podra enriquecer peliculas ni mostrar caratulas reales.
- En produccion deberias configurar siempre `SESSION_SECRET` con una cadena larga, aleatoria y privada.
- La nota externa muestra la fuente real disponible; Rotten Tomatoes se trata como preferencia, no como dependencia obligatoria.

## Endpoints principales

- `POST /api/auth/login`
- `GET /api/movies/search?q=...`
- `POST /api/weekly-recommendations/generate`
- `POST /api/weekly-recommendations/select`
- `POST /api/pending/add`
- `POST /api/pending/remove`
- `POST /api/watch/mark-watched`
- `POST /api/profile/update`
- `POST /api/ratings/create-or-update`
- `GET /api/history/list`
