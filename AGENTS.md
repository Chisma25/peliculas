# AGENTS.md — Cine Semanal

Este archivo es la guía operativa para cualquier agente o persona que continúe el proyecto. Léelo antes de cambiar código, datos, variables de entorno o despliegues. El contexto funcional y el estado del producto están en `docs/PROJECT_CONTEXT.md`.

## Propósito y alcance

Cine Semanal es una aplicación web privada para un grupo cerrado de amigos. Sustituye un Excel compartido y centraliza películas vistas, notas individuales, pendientes, elección semanal y descubrimiento. No es un producto SaaS ni está orientado a usuarios públicos: se priorizan la experiencia del grupo, el cuidado visual y la seguridad de sus datos sobre la escalabilidad comercial.

## Arquitectura

La aplicación es un monolito Next.js con App Router:

```text
Navegador
  -> páginas y componentes React de Next.js
  -> Route Handlers en app/api
  -> fachada de dominio y persistencia en src/lib/store.ts
     -> PostgreSQL/Neon mediante Prisma en Preview y Producción
     -> archivo JSON atómico en desarrollo sin DATABASE_URL
  -> TMDb para búsqueda, metadatos, imágenes, cartelera, estrenos y descubrimiento
```

### Capas principales

- `app/`: páginas, layout, estilos globales y Route Handlers. Las páginas son Server Components salvo interacciones que requieren estado de cliente.
- `src/components/`: componentes compartidos e interactivos. Los componentes con estado, eventos o APIs del navegador declaran `"use client"`.
- `src/lib/store.ts`: fachada única para lecturas y mutaciones de la aplicación. Los componentes no deben consultar Prisma directamente.
- `src/lib/recommendations.ts`: lógica pura del radar semanal, cartelera, estrenos y descubrimiento.
- `src/lib/movie-provider.ts`: adaptador de TMDb, normalización, filtros de calidad y caché.
- `src/lib/session.ts`, `src/lib/api-session.ts` y `proxy.ts`: sesión firmada, resolución del usuario y protección de rutas.
- `src/lib/environment-safety.ts`: impide conectar Preview o desarrollo a la base de Producción por error.
- `src/lib/state-persistence.ts`, `local-state-storage.ts` y `normalized-state.ts`: persistencia atómica, modo local y composición del estado normalizado.
- `prisma/schema.prisma`: esquema PostgreSQL.
- `scripts/`: diagnóstico, checkpoints, exportación, verificación y operaciones controladas de base de datos/despliegue.
- `tests/`: Vitest para dominio, seguridad y scripts.
- `e2e/`: Playwright contra desarrollo local o una Preview desplegada.
- `.github/workflows/`: puerta de calidad de Preview, verificación de Producción y monitor diario.

## Tecnologías y versiones

Usa las versiones fijadas por `package.json` y `package-lock.json`:

- Node.js `24.x`.
- npm con instalación reproducible mediante `npm ci`.
- Next.js `16.2.12` con App Router y Turbopack.
- React y React DOM `19.2.8`.
- TypeScript `^5.7.2`, modo `strict`, target ES2022.
- Prisma y `@prisma/client` `^6.19.3`.
- PostgreSQL alojado en Neon.
- Vitest `^4.1.10`.
- Playwright `^1.62.0`, proyectos Chromium desktop y Pixel 7.
- ESLint `9.39.5` con reglas Core Web Vitals y TypeScript de Next.
- Sharp `^0.35.3` para imágenes.
- Vercel para Preview y Producción; las funciones API se ejecutan en `fra1`.

No actualices dependencias mayores como parte de un cambio funcional sin tratarlas como un trabajo independiente y volver a ejecutar toda la validación.

## Estructura de carpetas

```text
app/
  api/                         APIs de autenticación, catálogo, notas y operaciones
  styles/                      estilos por superficie y sistema cinematográfico
  catalogo/                    compatibilidad/entrada de catálogo
  explorar/                    búsqueda TMDb y descubrimiento bajo demanda
  grupo/                       resumen del grupo y perfiles públicos internos
  peliculas/[slug]/            ficha cinematográfica y valoraciones
  pendientes/                  radar y archivo de pendientes
  perfil/                      perfil propio y edición
  vistas/                      archivo de películas vistas
docs/                          contexto y documentación de continuidad
e2e/                           pruebas Playwright y preparación de sesión
prisma/                        esquema de datos
public/brand/                  marca y logotipo
scripts/                       herramientas operativas versionadas
src/components/                UI compartida e interacciones cliente
src/lib/                       dominio, datos, seguridad e integraciones
tests/                         pruebas unitarias e integración ligera
```

Los archivos `data/*.json`, `.env*local`, `playwright/.auth`, reportes de pruebas y `.vercel` son locales y están ignorados. No dependen del repositorio y deben respaldarse por separado cuando contengan información necesaria.

## Puesta en marcha desde un equipo nuevo

1. Instala Git y Node.js 24.
2. Clona el repositorio y entra en su raíz.
3. Ejecuta `npm ci`.
4. Copia `.env.example` a `.env.local` y rellena únicamente valores locales o de un entorno aislado.
5. Para desarrollo sin PostgreSQL, deja `DATABASE_URL` vacía. El estado se guarda en `data/runtime-state.json`.
6. Arranca con `npm run dev` y abre `http://localhost:3000`.
7. Ejecuta pruebas, lint y build antes de preparar una PR.

Si se necesita recuperar también el estado local, checkpoints o exports, cópialos desde el respaldo privado al nuevo equipo. Nunca los añadas a Git.

## Comandos

### Instalación y ejecución

```bash
npm ci
npm run dev
npm run build
npm run start
```

### Calidad

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

`npm run test:e2e` arranca desarrollo local si no existe `E2E_BASE_URL`. Para probar una Preview se requieren una cuenta dedicada y el bypass de protección de Vercel mediante variables locales o secretos de GitHub.

### Prisma y datos

```bash
npm run db:push
npm run db:seed
npm run db:health -- --environment=preview --env-file=.env.preview.local
npm run db:checkpoint -- --environment=preview --env-file=.env.preview.local --label=antes-del-cambio
npm run db:export -- --environment=preview --env-file=.env.preview.local
npm run db:verify-backup -- --file=data/archivo.json
npm run db:restore -- --dry-run --environment=preview --env-file=.env.preview.local --file=data/archivo.json
npm run db:repair-movie-metadata -- --environment=preview --env-file=.env.preview.local
npm run db:clean-preview -- --environment=preview --env-file=.env.preview.local
```

`db:seed`, `db:repair-movie-metadata` y `db:clean-preview` pueden mutar datos. Antes de usarlos, verifica el host, crea un checkpoint y emplea siempre Preview salvo que exista autorización explícita para Producción.

El seed exige `CONFIRM_DATABASE_SEED` con el mismo valor que `DATABASE_ENVIRONMENT`. No lo uses para una actualización ordinaria: reemplaza conjuntos normalizados del grupo y solo está pensado para bootstrap o recuperación deliberada.

### Verificación de despliegue

```bash
npm run deploy:verify -- --url=https://cine-semanal.vercel.app --expected-commit=SHA --expected-ref=main --expected-environment=production
```

## Variables de entorno

Nunca documentes ni confirmes valores reales de secretos. Las plantillas canónicas son `.env.example`, `.env.preview.example` y `.env.production.example`.

### Aplicación y base de datos

- `APP_ENV`: `development`, `test`, `preview` o `production`.
- `DATABASE_ENVIRONMENT`: `development`, `preview` o `production`; debe concordar con `APP_ENV`.
- `DATABASE_URL`: conexión PostgreSQL de runtime, normalmente mediante pooler.
- `DIRECT_URL`: conexión directa usada por Prisma para operaciones de esquema.
- `PRODUCTION_DATABASE_HOST`: únicamente el hostname de Producción, sin usuario, contraseña ni puerto.
- `ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT`: permite explícitamente una base remota etiquetada como `development`.
- `APP_DATA_DIR`: directorio del estado local; por defecto `data`.
- `APP_SNAPSHOT_ID`: identificador del snapshot agregado; actualmente se usa `main` por entorno.
- `CONFIRM_DATABASE_SEED`: confirmación temporal para `db:seed`; debe coincidir con el entorno objetivo.

### Integraciones y seguridad

- `TMDB_API_KEY`: acceso a TMDb.
- `SESSION_SECRET`: firma HMAC de cookies; en Producción debe tener al menos 32 caracteres.
- `ADMIN_RESET_CODE`: acceso de emergencia para restablecer credenciales.
- `HEALTHCHECK_SECRET`: autorización de `/api/health`.

### Pruebas y despliegue

- `E2E_BASE_URL`: URL de la Preview o instancia local que probará Playwright.
- `E2E_USERNAME` y `E2E_PASSWORD`: cuenta exclusiva de QA; nunca reutilizar una cuenta personal.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: bypass para pruebas automáticas sobre Preview protegida.
- `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` y `VERCEL_GIT_COMMIT_REF`: las inyecta Vercel; no se configuran manualmente.

Secretos requeridos en GitHub Actions:

- `E2E_USERNAME`.
- `E2E_PASSWORD`.
- `VERCEL_AUTOMATION_BYPASS_SECRET`.
- `PRODUCTION_HEALTHCHECK_SECRET`.

Variables reales de Vercel deben configurarse por ámbito. Preview y Producción deben tener bases y secretos distintos.

## Persistencia y modelo de lectura

- Sin `DATABASE_URL`, desarrollo usa `data/runtime-state.json` con reemplazo atómico.
- Con PostgreSQL, usuarios, películas, pendientes, vistas, notas y tandas semanales se leen de tablas normalizadas.
- `AppSnapshot` conserva contexto agregado y compatibilidad, pero nunca debe repoblar automáticamente tablas normalizadas vacías.
- Las mutaciones relacionadas se ejecutan en una transacción Prisma y la caché solo se publica después del commit durable.
- En serverless no se considera fiable la caché mutable del proceso; las lecturas posteriores a una mutación vuelven a la base compartida.
- Ante errores de base, Preview y Producción fallan de forma cerrada: no deben mostrar o escribir un estado local potencialmente obsoleto.

## Convenciones de código

- TypeScript estricto, comillas dobles, punto y coma y dos espacios de indentación.
- Componentes y tipos en `PascalCase`; funciones y variables en `camelCase`; rutas y archivos de página en minúsculas/kebab-case.
- Usa el alias `@/` para imports desde `src/`.
- Server Components por defecto. Añade `"use client"` solo si el componente necesita estado, eventos, efectos o APIs del navegador.
- Mantén lógica de dominio pura en `src/lib` y añade pruebas Vitest para reglas, normalización y seguridad.
- Las Route Handlers deben resolver sesión, validar entrada, devolver errores operativos coherentes y delegar en `store.ts`.
- No accedas a Prisma desde páginas o componentes.
- No dupliques películas: conserva `sourceIds.tmdb`, slug y año, y usa las utilidades de deduplicación existentes.
- Las notas válidas van de 0 a 10 en incrementos de 0,25. Valida siempre también en backend.
- La película semanal puede elegirse desde el radar o desde cualquier pendiente válida. Una película vista deja de estar pendiente y no puede seguir seleccionada.
- Mantén textos de interfaz en español y con un tono directo, no comercial ni grandilocuente.
- Reutiliza `PosterImage`, `UserAvatar`, `PrefetchLink`, filtros, diálogos y controles existentes antes de crear variantes.
- Conserva accesibilidad básica: HTML semántico, etiquetas, navegación por teclado, estados de carga/error/vacío y respeto a movimiento reducido.
- El sistema visual usa superficies editoriales cinematográficas, tipografía de gran escala, tonos oscuros cálidos, acento ámbar, imágenes con contraste y secciones `data-scroll-chapter`. Evita reintroducir las tarjetas azuladas y redondeadas del diseño v1.
- El scroll por capítulos debe ayudar a encuadrar, no capturar cada gesto. Prueba siempre escritorio y móvil.

## Pruebas exigidas por tipo de cambio

- Dominio, seguridad o datos: prueba unitaria específica, `npm test`, `npm run lint` y `npm run build`.
- Interacción cliente: lo anterior más Playwright o un flujo manual equivalente en Preview.
- CSS o layout: revisa al menos escritorio y un viewport móvil, estados con muchos/pocos/sin resultados y textos largos.
- Mutación de datos: Preview, checkpoint previo, comprobación de integridad posterior y flujo completo de usuario.
- Producción: nunca desplegar una mutación no ensayada en Preview.

## Proceso de despliegue

1. Crea una rama `codex/<descripcion>` desde `origin/main`.
2. Implementa y valida localmente.
3. Haz push de la rama y abre una PR hacia `main`.
4. Espera los checks obligatorios:
   - `quality`: tests, lint, build y auditoría de dependencias;
   - `authenticated-preview`: Playwright desktop y móvil sobre la Preview correspondiente;
   - Vercel Preview.
5. Revisa manualmente la Preview cuando el cambio sea visual o afecte a datos.
6. Integra mediante squash; `main` está protegida y no admite push directo ni merge commits.
7. La integración GitHub–Vercel despliega `main` automáticamente a Producción.
8. El workflow `Verify production deployment` confirma que `https://cine-semanal.vercel.app` sirve el SHA de `main` en entorno `production`.
9. El workflow diario consulta `/api/health` con autorización y comprueba base e integridad.

Un `vercel --prod` manual puede servir como recuperación puntual, pero no sustituye integrar el mismo código en `main`; de lo contrario, el siguiente despliegue automático podría revertir Producción.

## Copias de seguridad y recuperación

- Neon es la fuente principal para restauración temporal y snapshots del servicio.
- Antes de cualquier cambio delicado crea `db:checkpoint` contra el entorno explícito y verifica el archivo.
- Los checkpoints y exports incluyen datos privados y hashes de credenciales. Guárdalos fuera de Git en almacenamiento privado.
- `db:restore` está bloqueado deliberadamente a `--dry-run`; la restauración real se hace desde Neon o mediante un procedimiento administrativo revisado.
- Tras recuperar: ejecuta `db:health`, verifica recuentos y relaciones, completa un flujo funcional y crea un checkpoint nuevo.

## Decisiones técnicas que no deben revertirse accidentalmente

- Preview y Producción usan bases físicamente distintas. Cambiar solo `APP_SNAPSHOT_ID` no aísla tablas normalizadas.
- La base de Producción es la fuente de verdad; no se sincroniza desde Preview.
- El snapshot agregado no puede resucitar datos normalizados antiguos.
- Las recomendaciones son una ayuda para elegir, no un sistema de votación.
- El radar muestra una selección breve de pendientes, pero nunca impide elegir otra película del archivo.
- Descubrimiento es bajo demanda para evitar coste y ruido: no consulta TMDb hasta pulsar “Generar selección”.
- La imagen horizontal de la ficha usa backdrop cuando existe y la carátula queda separada; el póster solo es fallback.
- Los filtros de Vistas y Pendientes son dinámicos y mantienen el usuario dentro del capítulo del catálogo.
- La navegación entre páginas empieza arriba de forma inmediata; no debe animar desde la posición de scroll anterior.
- Avatares se sirven desde una ruta propia y deben actualizarse en cabecera, menú y perfil tras guardarlos.

## Restricciones y problemas conocidos

- No hay errores funcionales bloqueantes conocidos a fecha de 2026-08-02.
- La aplicación depende de TMDb para contenido nuevo. Sin `TMDB_API_KEY`, el histórico local sigue disponible, pero búsqueda, enriquecimiento, cartelera, estrenos y descubrimiento quedan degradados o vacíos.
- La caché TMDb en código es principalmente de proceso y `fetch` de Next revalida cada 12 horas; los cold starts pueden repetir algunas consultas. Existe `TmdbCacheEntry` en Prisma, pero no es la caché activa principal.
- No existe un directorio de migraciones Prisma versionado; los cambios de esquema se aplican con `prisma db push`. Esto exige especial cuidado, checkpoint y validación en Preview.
- `db:restore` no realiza restauraciones reales.
- Los E2E autenticados dependen de secretos externos y de que exista una cuenta QA válida en Preview.
- Los datos, `.env.local`, checkpoints, exports y cualquier respaldo previo al formateo no están en Git.
- El README aún menciona “Node 20 o superior”; la configuración efectiva de `package.json` y CI exige Node 24.x.
- Los archivos locales actualmente no versionados, incluidos `design/`, scripts de recuperación histórica y `Respaldo-post-formateo*`, no acompañarán a un clon nuevo. No los borres hasta confirmar que el respaldo privado contiene lo necesario.

## Límites de seguridad

- No incluir contraseñas, tokens, URLs con credenciales, cookies, claves API ni hashes de usuarios en commits, logs o documentación.
- No imprimir el contenido de `.env.local` ni de backups en herramientas o conversaciones.
- No ejecutar seed, limpieza, reparación o restauración contra Producción sin autorización explícita y checkpoint verificado.
- No mezclar las variables de Preview y Producción.
- No hacer push ni desplegar si el usuario solo solicita revisión o diff.
