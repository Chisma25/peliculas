# Operación, despliegues y recuperación

[Inicio](../README.md) · [Desarrollo](desarrollo.md) · [Arquitectura](arquitectura.md)

## Servicios

| Servicio | Referencia |
| --- | --- |
| Código | [Chisma25/peliculas](https://github.com/Chisma25/peliculas) |
| Producción | [cine-semanal.vercel.app](https://cine-semanal.vercel.app) |
| Despliegues | [Proyecto cine-semanal de Vercel](https://vercel.com/ismaelemma7-2148s-projects/cine-semanal) |
| Datos | Proyecto Neon `neon-violet-lighthouse`; [consola de la organización](https://console.neon.tech/app/org-holy-mode-25412025/projects) |

El acceso al repositorio, Vercel y Neon se concede por separado. Una sesión de la app no permite administrar esos servicios. Usa las cuentas y permisos correspondientes; no guardes tokens, URL con contraseña ni exports en el repositorio.

## Configuración de entornos

Preview y Producción deben apuntar a bases o ramas independientes de Neon. Pueden pertenecer al mismo proyecto Neon, pero no compartir las mismas tablas. Cambiar `APP_SNAPSHOT_ID` no proporciona aislamiento.

| Variable de Vercel | Preview | Production |
| --- | --- | --- |
| `APP_ENV` | `preview` | `production` |
| `DATABASE_ENVIRONMENT` | `preview` | `production` |
| `DATABASE_URL` | URL pooler de Preview | URL pooler de Producción |
| `DIRECT_URL` | URL directa de Preview | URL directa de Producción |
| `PRODUCTION_DATABASE_HOST` | Host de la URL pooler de Producción | Ese mismo host |
| `APP_SNAPSHOT_ID` | `main` | `main` |
| `SESSION_SECRET` | Secreto exclusivo, ≥32 caracteres | Otro secreto exclusivo, ≥32 caracteres |
| `ADMIN_RESET_CODE` | Código exclusivo de Preview | Otro código exclusivo |
| `TMDB_API_KEY` | Clave configurada del proveedor | Clave configurada del proveedor |
| `HEALTHCHECK_SECRET` | Opcional | Secreto del monitor privado |

Configura cada ámbito de Vercel por separado. `PRODUCTION_DATABASE_HOST` contiene únicamente el hostname, sin usuario, contraseña, puerto o ruta; el hostname pooler y el directo no son intercambiables para esta comprobación. La app rechaza contradicciones de entorno o un host de Producción usado como Preview.

Secretos en GitHub Actions:

| Secreto | Uso |
| --- | --- |
| `E2E_USERNAME`, `E2E_PASSWORD` | Cuenta dedicada con datos de Preview |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Acceso de pruebas a la Preview protegida |
| `PRODUCTION_HEALTHCHECK_SECRET` | Debe coincidir con `HEALTHCHECK_SECRET` en Producción |

El `GITHUB_TOKEN` de los workflows lo proporciona Actions. Las plantillas `.env.*.example` contienen ejemplos; para herramientas locales crea archivos privados `.env.preview.local` y `.env.production.local`. Sigue las reglas de carga de variables de [Desarrollo](desarrollo.md#variables-de-entorno).

## Entrega habitual

1. Abrir una PR hacia `main`. La integración de GitHub con Vercel crea la Preview de la rama.
2. Esperar `quality`: instalación, Vitest, migraciones y relaciones/concurrencia con PostgreSQL desechable, lint, build, auditoría y pruebas HTTP aisladas de seguridad. Si cambia el esquema, aplicar la migración revisada primero en Preview antes de validar sus flujos; seguir el apartado de cambios de esquema para Producción.
3. Esperar `authenticated-preview`: localiza el despliegue del mismo commit y ejecuta los flujos de navegador con la cuenta de Preview.
4. Fusionar la PR con las comprobaciones requeridas aprobadas y la rama actualizada. No se ejecuta un seed.
5. Vercel construye y publica automáticamente `main`. El workflow `Verify production deployment` verifica el dominio de Producción contra el SHA fusionado.
6. Comprobar identidad y salud; conservar la referencia de la PR y del despliegue como evidencia.

```powershell
npm run deploy:verify -- --url=https://cine-semanal.vercel.app --expected-commit=SHA_COMPLETO --expected-ref=main --expected-environment=production
```

Sustituye `SHA_COMPLETO` por el commit de `main` tras la fusión, no por el de la rama antes de un squash. `/api/version` es público, de solo lectura y sin caché; un build READY de Vercel por sí solo no demuestra que el dominio ya sirva ese commit.

## Instalación inicial con PostgreSQL

Este procedimiento es para una base nueva y vacía. No es el proceso de actualización.

1. Preparar las conexiones y variables del entorno, empezando por Preview.
2. Revisar el estado local que se importará: usuarios, permisos, notas y películas. No usar una copia de prueba como datos reales.
3. En una terminal limpia y desde la raíz, aplicar el esquema al destino verificado:

```powershell
node --env-file=.env.preview.local node_modules/prisma/build/index.js migrate deploy
```

4. Solo si se quiere importar el archivo local a esa base nueva, confirmar el entorno y cargarlo:

```powershell
$env:CONFIRM_DATABASE_SEED="preview"
node --env-file=.env.preview.local scripts/bootstrap-db.mjs
Remove-Item Env:CONFIRM_DATABASE_SEED
```

El script lee `APP_DATA_DIR/runtime-state.json` o `data/runtime-state.json`. Crea/actualiza usuarios y películas, **borra y reconstruye** pendientes, vistas y tandas del grupo, y **reemplaza todas las notas**. También sustituye el snapshot. No es una migración incremental ni una restauración transaccional completa: sus fases pueden confirmarse por separado.

5. Ejecutar `db:health`, comprobar acceso y un flujo funcional en Preview. Preparar Producción por separado, con sus propios datos revisados. Si se necesita una carga inicial allí, usar su archivo privado y confirmación `production`, nunca reutilizar el destino por accidente.

## Cambios de esquema y mantenimiento

**No ejecutar `db:seed` después de cada cambio de esquema.** El esquema describe estructuras; el seed reemplaza datos con una fuente local.

El historial está en [prisma/migrations](../prisma/migrations). `20260907000000_baseline` representa el esquema anterior a las relaciones y `20260907000100_relational_integrity` añade seis claves foráneas y tres índices, sin transformar filas. La segunda migración es transaccional, espera como máximo 5 segundos para cada bloqueo y limita cada sentencia a 60 segundos; ante un fallo no deja restricciones aplicadas a medias.

Para una base **existente que aún no tenga historial**, comparar primero su esquema con el baseline y comprobar integridad/copia. Solo si coincide, registrar el baseline sin ejecutar sus `CREATE TABLE`:

```powershell
node --env-file=.env.preview.local node_modules/prisma/build/index.js migrate resolve --applied 20260907000000_baseline
```

Este registro se hizo una sola vez en Preview y Producción al adoptar Migrate. No repetirlo para futuras migraciones ni para una base vacía: en una vacía, `migrate deploy` crea todo. Es el procedimiento de [baselining de Prisma](https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started).

Para actualizaciones, revisar el SQL, probarlo en Preview, esperar CI y aplicar al destino verificado con una terminal limpia y sus variables privadas:

```powershell
node --env-file=.env.preview.local node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.preview.local node_modules/prisma/build/index.js migrate status
```

En Producción usar su propio archivo y hacerlo antes del despliegue de código que requiera la estructura. Vercel no aplica migraciones automáticamente. No usar `db push`, `migrate reset`, `--accept-data-loss` ni un seed para actualizar una base compartida. La CI instala el historial desde cero y compara el esquema resultante con Prisma, además de probar las claves foráneas y las mutaciones concurrentes.

Si esta migración de relaciones falla por datos inválidos o por un bloqueo, conservar el error, verificar que la transacción se deshizo y resolver la causa; marcar **solo esa ejecución fallida** con `migrate resolve --rolled-back 20260907000100_relational_integrity` antes de reintentar. No marcar como fallida una migración aplicada correctamente. Para volver al código anterior pueden mantenerse estas relaciones, compatibles con las operaciones normales. Si fuera necesario retirar las restricciones, preparar una nueva migración compensatoria y actualizar Prisma; no editar ni borrar el historial aplicado ni restaurar los datos encima de escrituras posteriores.

Antes de una reparación o transformación de datos, crear una copia, acordar una ventana sin escrituras y preparar una vuelta atrás. La app no tiene un interruptor de mantenimiento documentado: el operador debe detener efectivamente las escrituras y coordinar al grupo. Los scripts administrativos no adquieren el bloqueo de las mutaciones normales.

## Diagnóstico y copias

Los comandos siguientes consultan la base; no cambian filas:

```powershell
npm run db:health -- --environment=preview --env-file=.env.preview.local
npm run db:checkpoint -- --environment=preview --env-file=.env.preview.local --label=antes-del-cambio
npm run db:verify-backup -- --file=data/database-checkpoint-preview-ETIQUETA-FECHA.json
npm run db:restore -- --dry-run --environment=preview --env-file=.env.preview.local --file=data/database-checkpoint-preview-ETIQUETA-FECHA.json
```

Usa el nombre real generado por el checkpoint. Para Producción, cambia tanto `--environment` como `--env-file`. Los scripts comprueban que el entorno y el host declarado concuerdan.

| Comando | Resultado y límites |
| --- | --- |
| `db:health` | Detecta huérfanos, duplicados, notas inválidas, solapamientos, inconsistencias de tandas, fechas y metadatos; código 2 ante errores estructurales |
| `db:checkpoint` | Exporta tablas, valida checksum y origen, escribe un temporal y publica el JSON final; no sobrescribe un destino existente. Conserva evidencia y devuelve código 2 si encuentra errores de integridad |
| `db:export` | Exporta JSON con checksum; permite `--output`. El directorio de salida debe existir y puede sobrescribir un archivo; preferir checkpoint para puntos de recuperación |
| `db:verify-backup` | Verifica formato, checksum e integridad sin conexión a una base |
| `db:restore` | Solo admite `--dry-run`: exige el mismo entorno y host exacto, compara volúmenes y valida el backup. No restaura filas ni hace un diff completo registro por registro |

Estos JSON contienen datos privados y hashes. Los `.json` de `data` se ignoran en Git; otros destinos o temporales `.partial` requieren el mismo cuidado. Copiarlos a almacenamiento privado es una tarea del operador: no hay subida automática de exports a almacenamiento externo.

La lectura de tablas del export/checkpoint usa consultas independientes. **El checksum valida el archivo, no garantiza una instantánea consistente de la base durante escrituras concurrentes.** Para un punto de recuperación, detener escrituras durante la exportación o usar un snapshot de Neon; verificar después la integridad.

### Copias de Neon

Configuración consultada el **5 de septiembre de 2026** en el proyecto y la rama de Producción:

- Historial de restauración: 604.800 segundos, **7 días**.
- Snapshot diario a las 00:00 UTC, retención **14 días**.
- Snapshot semanal el lunes a las 00:00 UTC, retención **35 días**.
- Snapshot mensual el día 1 a las 00:00 UTC, retención **30 días**.

Esta configuración reside en Neon, no en Git. Antes de depender de una fecha de recuperación, comprobar la programación y que exista una copia disponible en la consola. `AppSnapshot` es contexto de la app, no sustituye esas copias.

### Recuperación

1. Detener escrituras y registrar la hora del incidente, el commit y los errores observados.
2. Conservar una copia diagnóstica del estado actual.
3. En Neon, localizar un estado anterior mediante Backup & Restore/Time Travel e inspeccionarlo primero en una rama temporal.
4. Comprobar integridad y datos funcionales allí. `db:restore --dry-run` no puede restaurar esa rama ni comparar un export con otro host: no sortear sus controles como atajo.
5. Con el destino y el estado elegido verificados, efectuar la recuperación con las herramientas administrativas de Neon. Evaluar qué cambios posteriores se perderían antes de confirmar.
6. Verificar salud, recuentos, acceso y un flujo funcional; reabrir escrituras y guardar un nuevo punto de recuperación.

Para un fallo solo de código, valorar restaurar el despliegue anterior en Vercel o revertir la PR en GitHub, comprobando compatibilidad con la base. Un rollback de Vercel no revierte datos; si el dominio sirve un commit anterior a `main`, la verificación de identidad lo detectará hasta reconciliar código y despliegue.

## Monitorización e incidencias

[Daily production health](../.github/workflows/daily-health.yml) está programado a las **07:17 UTC** y admite ejecución manual. Comprueba el commit y consulta `/api/health` con un secreto; revisa conectividad, recuentos y reglas de integridad. Los detalles HTTP están en [API](api.md).

| Síntoma | Comprobación inicial |
| --- | --- |
| Login 503 | `SESSION_SECRET`, entorno, disponibilidad de Neon y logs de la incidencia |
| Sesión deja de funcionar | Caducidad, cambio de contraseña o rotación de `SESSION_SECRET`; volver a entrar |
| Error 503 al guardar | Estado de Neon, timeout/bloqueo y logs; no importar un seed como reparación |
| Preview muestra acceso de Vercel | Protección del despliegue y secreto de bypass del workflow |
| Búsqueda sin resultados externos | Clave TMDb, disponibilidad del proveedor y cachés |
| Producción no coincide con `main` | Estado del despliegue, alias del dominio y `/api/version` |
| Salud degradada | Leer las incidencias; preparar copia y diagnóstico antes de modificar filas |

Herramientas de mantenimiento adicionales: `db:repair-movie-metadata` consulta TMDb y simula por defecto; escribir exige `--apply --confirm=ENTORNO`. `db:clean-preview` elimina títulos técnicos concretos, solo admite Preview y exige `--apply --confirm=preview`. Ambas aceptan `--environment`/`--env-file`; revisar sus [scripts](../scripts) y el resultado de simulación antes de aplicar. La limpieza técnica de Preview también tiene una ruta automática de compatibilidad en el store.
