# Desarrollo y pruebas

[Inicio](../README.md) · [Arquitectura](arquitectura.md) · [Operación](operacion.md)

## Instalación local

Usa Node.js **24.x**, npm y Git. Desde la raíz del clon, en PowerShell:

```powershell
Copy-Item .env.example .env.local
npm ci
```

No repitas la copia sobre un archivo ya configurado. `npm ci` instala las versiones del lockfile y ejecuta `prisma generate` mediante `postinstall`. Consulta [package.json](../package.json) para los scripts vigentes.

En `.env.local`, mantén `APP_ENV=development`, `DATABASE_ENVIRONMENT=development` y `DATABASE_URL`/`DIRECT_URL` vacíos para usar datos locales. Cambia los valores de ejemplo de `ADMIN_RESET_CODE` y `SESSION_SECRET`. Para generar un valor aleatorio, ejecuta lo siguiente y guárdalo únicamente en el archivo privado:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run dev
```

La app estará en [localhost:3000](http://localhost:3000). `TMDB_API_KEY` es opcional para arrancar: sin ella se puede consultar el catálogo local, pero no obtener nuevos resultados y metadatos remotos. Las imágenes ya guardadas pueden seguir mostrándose.

## Primer acceso

En modo archivo, la primera carga prepara las cuentas y el historial iniciales. No hay contraseña pública de demostración ni formulario de registro. Abre `/reset-credenciales`, introduce tu `ADMIN_RESET_CODE`, identifica una cuenta inicial por usuario o nombre visible y asígnale usuario y contraseña. Puedes consultar las identidades iniciales en [demo-data.ts](../src/lib/demo-data.ts).

El reset no convierte la cuenta en administradora. Si necesitas probar administración, asigna `isAdmin: true` explícitamente en el estado local de prueba con el servidor detenido. No edites cuentas reales para preparar pruebas. El resto de límites de credenciales está en [Funcionalidad](funcionalidad.md#cuentas-y-permisos).

`APP_DATA_DIR` permite usar un directorio de datos independiente. `runtime-state.json`, sus exportaciones y los archivos de sesión E2E están excluidos de Git. Si decides empezar de nuevo, conserva o renombra antes tu archivo local: contiene tus cambios.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `APP_ENV` | `development`, `test`, `preview` o `production`; debe concordar con `VERCEL_ENV` si existe |
| `DATABASE_ENVIRONMENT` | `development`, `preview` o `production`; etiqueta del destino de datos |
| `DATABASE_URL` | Conexión PostgreSQL del runtime; vacío activa el archivo local |
| `DIRECT_URL` | Conexión directa usada por Prisma CLI para el esquema |
| `PRODUCTION_DATABASE_HOST` | Host exacto de la conexión runtime de Producción, sin credenciales; obligatorio en entornos desplegados |
| `ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT` | Por defecto `false`; una base remota de desarrollo exige `true` y `DATABASE_ENVIRONMENT=development` |
| `APP_DATA_DIR` | Directorio local; por defecto `data` |
| `APP_SNAPSHOT_ID` | Identificador del snapshot agregado; no separa tablas ni grupos |
| `TMDB_API_KEY` | Clave del proveedor de películas |
| `SESSION_SECRET` | Firma de sesiones; al menos 32 caracteres con `NODE_ENV=production` |
| `ADMIN_RESET_CODE` | Código de recuperación; vacío deshabilita el reset |
| `HEALTHCHECK_SECRET` | Secreto Bearer exclusivo de `/api/health` |

Plantillas: [.env.example](../.env.example), [.env.preview.example](../.env.preview.example) y [.env.production.example](../.env.production.example). Los valores son ejemplos, no conexiones utilizables. Los secretos de Vercel y GitHub se configuran en [Operación](operacion.md#configuración-de-entornos).

**Carga de variables:** Next carga `.env.local` para la app. Los scripts de diagnóstico aceptan `--env-file`. `bootstrap-db.mjs` no lo carga por sí mismo; Prisma CLI tampoco debe suponerse configurado por `.env.local`. Usa variables del proceso o `node --env-file=ARCHIVO` como en la guía de operación. Las variables ya exportadas en el proceso prevalecen sobre `node --env-file`: abre una terminal limpia y comprueba el destino sin imprimir contraseñas.

## Pruebas

### Suite habitual

```powershell
npm test
npm run lint
npm run build
npm run test:security
```

Vitest comprueba reglas, sesiones, recuperación, persistencia y concurrencia local. `test:security` necesita el build y crea su propio servidor con cuentas ficticias y un directorio temporal: comprueba permisos, HTML/RSC sin hashes y revocación tras cambios propios, administrativos y de emergencia. No usa una base remota.

### Concurrencia con PostgreSQL

Necesitas un PostgreSQL local independiente. En una terminal limpia, crea una base **vacía y desechable** llamada exactamente `cine_concurrency_test`. Ejemplo para quien tenga Docker instalado:

```powershell
docker run --name cine-concurrency-docs --detach --publish 127.0.0.1:5432:5432 --env POSTGRES_USER=cine_test --env POSTGRES_PASSWORD=local_test_only --env POSTGRES_DB=cine_concurrency_test postgres:16
docker exec cine-concurrency-docs pg_isready -U cine_test -d cine_concurrency_test
```

Espera a que `pg_isready` confirme disponibilidad. Si el puerto está ocupado, elige otro y modifica las URL siguientes:

```powershell
$env:APP_ENV="test"
$env:DATABASE_ENVIRONMENT="development"
$env:DATABASE_URL="postgresql://cine_test:local_test_only@127.0.0.1:5432/cine_concurrency_test"
$env:DIRECT_URL=$env:DATABASE_URL
$env:CONCURRENCY_DATABASE_URL=$env:DATABASE_URL
npx prisma db push --skip-generate
npx vitest run tests/store-concurrency.test.ts
```

La suite **vacía tablas entre casos** y rechaza hosts remotos u otros nombres de base. Ejecuta la variante local y la de PostgreSQL con módulos independientes; incluye un fallo real de snapshot para verificar rollback de la cuenta. El caso de rollback PostgreSQL se omite en la variante de archivo. No deben existir `VERCEL_ENV` ni otras variables de despliegue contradictorias en esa terminal.

Al terminar, elimina solo el contenedor desechable que creaste y cierra esa terminal para no reutilizar sus variables:

```powershell
docker rm --force cine-concurrency-docs
```

El [workflow de Preview](../.github/workflows/preview-quality.yml) ya provisiona PostgreSQL 16 y ejecuta esta receta. El servicio de Producción usa la versión registrada en [Estado del proyecto](estado-proyecto.md); el contenedor de CI no es una copia de datos reales.

### Navegador

```powershell
npx playwright install chromium
$env:E2E_BASE_URL="https://tu-preview.vercel.app"
$env:E2E_USERNAME="cuenta-dedicada-de-preview"
$env:E2E_PASSWORD="su-contrasena-privada"
$env:VERCEL_AUTOMATION_BYPASS_SECRET="secreto-de-automatizacion-de-vercel"
npm run test:e2e
```

Los valores son marcadores. La autenticación usa el login real y guarda una sesión local ignorada por Git. Sin `E2E_BASE_URL`, Playwright intenta arrancar o reutilizar un servidor local en `127.0.0.1:3000`; sin credenciales se omiten los flujos autenticados. El bypass solo es necesario si la Preview está protegida.

Se prueban Chromium de escritorio y Pixel 7, navegación, búsqueda, imágenes y selección semanal. Algunos casos son exclusivos de un tamaño de pantalla. La prueba que modifica una nota necesita `E2E_RATING_MOVIE_ID` y `E2E_RATING_MOVIE_SLUG` de una película dedicada; los resultados omitidos no equivalen a una prueba superada. Los E2E pueden modificar selección o notas: usa datos de Preview preparados para ello. Evidencias en `playwright-report` y trazas/capturas al fallar.

## Preparar una contribución

1. Parte de `main` actualizado y abre una rama; usamos el prefijo `codex/` en este trabajo.
2. Mantén separadas reglas, acceso a datos y presentación. Consulta [Arquitectura](arquitectura.md) antes de añadir otra responsabilidad al store.
3. Añade pruebas cuando cambies reglas o corrijas fallos; ejecuta las comprobaciones apropiadas.
4. Actualiza la guía afectada en la misma PR. Documenta limitaciones y evita promesas que el código no cumple.
5. Abre PR a `main` y espera las comprobaciones obligatorias. Para publicar, sigue [Operación](operacion.md#entrega-habitual).

El override `@prisma/config → deepmerge-ts 8.0.0` cubre GHSA-ggr8-5vv4-36mx en la dependencia anterior de Prisma 6. Está limitado a ese paquete. Al actualizarlo o cambiar Prisma, revisar auditoría, generación del cliente, build y pruebas; el proyecto no usa configuración Prisma TypeScript personalizada.
