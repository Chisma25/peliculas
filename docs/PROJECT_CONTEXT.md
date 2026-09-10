# Contexto del proyecto — Cine Semanal

- Última actualización: 2 de agosto de 2026.
- Estado de referencia: `main` en `f1cde3763a40615b12321db9e42a689325291d41`.
- Producción: `https://cine-semanal.vercel.app`.

## Objetivo actual

Cine Semanal es la aplicación privada de un grupo de amigos para organizar sus sesiones de cine. Su objetivo no es crecer como producto comercial, sino ofrecer una experiencia muy cuidada para:

- conservar el histórico real de películas vistas;
- registrar una nota y comentario por persona;
- mantener una lista amplia de pendientes;
- facilitar la elección de la siguiente película sin convertirla en una votación;
- descubrir películas nuevas cuando el grupo quiera;
- consultar perfiles y estadísticas del grupo;
- proteger los datos y poder recuperarlos ante un error.

La v1 funcional quedó cerrada y sólida. Después se ejecutó un rediseño integral —la v2 visual— manteniendo los flujos existentes, seguido de una última funcionalidad de descubrimiento bajo demanda. El producto está actualmente en fase de mantenimiento y uso real, no en una fase de expansión funcional.

## Filosofía de producto y diseño

- Aplicación personal y cerrada: las decisiones se optimizan para el grupo real, no para un público genérico.
- Funcionalidad contenida: no añadir elementos sociales, votaciones o métricas que no ayuden a elegir o recordar películas.
- Apariencia premium por gusto personal: lenguaje cinematográfico/editorial, imagen protagonista y transiciones de capítulos.
- Texto directo: se eliminaron frases pedantes, explicaciones redundantes y etiquetas técnicas que no aportaban.
- Las pantallas deben tener “alma” sin sacrificar claridad, rendimiento, móvil o accesibilidad básica.
- Producción contiene los datos buenos. Preview sirve para probar y puede tener un subconjunto o datos de QA distintos.

## Funcionalidades terminadas

### Autenticación y cuentas

- Login privado por usuario y contraseña.
- Sesión firmada en cookie `HttpOnly`, `SameSite=Lax`, con caducidad de 30 días.
- Rutas privadas protegidas desde `proxy.ts`.
- Perfil propio editable: nombre, usuario, contraseña opcional y avatar.
- Avatares actualizados de forma consistente en perfil, cabecera y menú.
- Menú de usuario anclado a la cabecera, sin salto visual y con cierre al pulsar fuera.
- Gestión administrativa de cuentas y reset de emergencia por código.

### Dashboard

- Primer capítulo con la película elegida para la semana, imagen cinematográfica, ficha, acción “marcar como vista” y resumen del grupo.
- Al marcarla como vista se persiste, se elimina de pendientes, se limpia la selección semanal y la interfaz ofrece feedback inmediato.
- Segundo capítulo “Ahora en cines”: tres títulos relevantes en cartelera española.
- Tercer capítulo “Próximamente”: tres próximos estrenos en España.
- Secciones de altura completa con navegación vertical y scroll asistido, sin capturar agresivamente la rueda.

### Pendientes

- Banner editorial con volumen del archivo.
- Radar semanal de cinco películas útiles para reducir una lista grande.
- La película ya elegida no vuelve a aparecer entre las cinco candidatas.
- El radar usa afinidad, calidad, variedad, contexto reciente y señales del grupo, pero muestra información práctica en lugar de métricas abstractas.
- Se puede elegir cualquier película del archivo de pendientes, aunque no esté en el radar.
- Catálogo uniforme de cuatro columnas en escritorio, paginación, búsqueda y filtro de género.
- Añadir y quitar pendientes con sincronización y feedback sin exigir recargar la página.
- Estados vacíos y sin resultados adaptados al lenguaje visual actual.

### Vistas y valoraciones

- Archivo de vistas ordenado desde las más recientes.
- Banner protagonizado por la película mejor valorada por el grupo, para no duplicar la primera del catálogo.
- Búsqueda, filtros, ordenación y paginación dinámicos.
- Nota individual por película, comentario opcional y edición posterior.
- Escala de 0 a 10 en incrementos de 0,25, validada en frontend y backend.
- Medias y notas formateadas sin truncar cuartos de punto.

### Ficha de película

- Hero con backdrop horizontal y carátula separada.
- Fallback controlado al póster cuando TMDb no proporciona backdrop.
- Director, año, duración, géneros, país, idioma, tráiler, TMDb y reparto.
- Sinopsis con tamaño de lectura contenido.
- Valoraciones del grupo y panel para crear o editar la propia.
- Capítulos de portada, datos/sinopsis y valoraciones correctamente encuadrados en escritorio y móvil.

### Explorar y descubrimiento

- Búsqueda específica de películas en TMDb.
- Deduplicación contra películas ya vistas, pendientes y resultados equivalentes.
- Filtro de extras técnicos, reviews, making-of y otros falsos positivos habituales.
- Enriquecimiento de metadatos al añadir una película.
- Sección independiente de descubrimiento bajo demanda:
  - no consulta TMDb al cargar;
  - genera cinco recomendaciones al pulsar el botón;
  - excluye vistas y pendientes;
  - usa películas bien valoradas por el grupo como semillas;
  - combina recomendaciones de TMDb, calidad, popularidad y diversidad;
  - permite regenerar una selección distinta;
  - muestra cinco marcos editoriales “Por revelar” antes de generar, evitando un capítulo vacío.

### Grupo y perfiles

- Primera sección de Grupo para entrar rápidamente al perfil de cualquier miembro.
- Segunda sección con resumen estadístico: valoraciones, medias, techos y volumen por miembro.
- Perfiles individuales con identidad, resumen útil y selección coral de valoraciones altas y bajas.
- Adaptación para perfiles con pocas notas, evitando composiciones vacías o desproporcionadas.
- Se eliminó la distribución de notas porque aportaba poco al uso real.

### Operación, seguridad y resiliencia

- PostgreSQL normalizado en Neon mediante Prisma.
- Persistencia local atómica para desarrollo sin base.
- Escrituras transaccionales y lectura compartida después de mutaciones en serverless.
- Separación estricta entre bases de Preview y Producción.
- Detección de configuraciones peligrosas mediante `environment-safety.ts`.
- Checkpoints y exports con checksum e integridad.
- Restauración local limitada deliberadamente a simulación.
- Health check privado para conexión, recuentos, notas inválidas, huérfanos y solapamientos.
- Workflow diario de salud.
- Identidad de despliegue en `/api/version` y verificación automática de que Producción sirve el SHA de `main`.
- Suite Vitest y E2E Playwright desktop/móvil sobre Preview autenticada.

## Funcionalidades pendientes

No queda ninguna funcionalidad obligatoria acordada. La aplicación puede considerarse cerrada para su uso actual.

Trabajo opcional, solo si aparece una necesidad real:

- persistir la caché de TMDb en `TmdbCacheEntry` para reducir llamadas repetidas entre cold starts;
- introducir migraciones Prisma versionadas si el esquema vuelve a evolucionar;
- automatizar una copia externa cifrada de los checkpoints, además de la retención de Neon;
- añadir observabilidad de errores de cliente/servidor si aparece un problema difícil de reproducir;
- revisar periódicamente accesibilidad con herramientas automáticas y navegación manual por teclado;
- depurar o versionar los scripts locales de recuperación histórica que hoy no están en Git.

No se recomienda añadir votaciones, comentarios sociales, perfiles públicos, notificaciones, listas personales o gamificación salvo que el grupo empiece a echarlos en falta de forma concreta.

## Decisiones tomadas y motivos

### Producción es la fuente de verdad

Hubo una incidencia previa en la que una base incorrecta sustituyó datos válidos. Desde entonces:

- Preview y Producción usan bases físicamente distintas;
- las variables declaran el entorno y el hostname de Producción;
- desarrollo remoto necesita una autorización explícita;
- Preview puede tener menos películas que Producción sin ser un problema;
- nunca se copian datos de Preview a Producción por conveniencia.

El histórico de Producción se recuperó y se corrigieron manualmente casos concretos. No deben recalcularse o redondearse masivamente las notas sin una fuente fiable.

### Tablas normalizadas por encima del snapshot

`AppSnapshot` se mantiene para contexto agregado y compatibilidad. Usuarios, películas, pendientes, vistas, notas y tandas proceden de tablas normalizadas. Una colección normalizada vacía es válida y el snapshot no puede repoblarla, evitando “resucitar” datos antiguos.

### Recomendaciones como ayuda, no como decisión

El radar semanal reduce el esfuerzo de revisar una lista grande, pero no pretende decidir por el grupo. Por eso:

- no hay votaciones;
- no se muestran puntuaciones de “afinidad” como argumento principal;
- se puede escoger cualquier pendiente;
- las cinco sugerencias buscan encaje, calidad y diversidad;
- una tanda nueva no hereda una selección inválida de la anterior.

### Descubrimiento bajo demanda

La sección de descubrir no se ejecuta automáticamente. El usuario decide cuándo quiere nuevas ideas. Esto reduce coste, llamadas a TMDb y ruido visual. Regenerar cambia semillas/página y excluye la selección anterior.

### Rediseño editorial por capítulos

El diseño anterior se percibía plano y parecido a catálogos genéricos. La v2 adoptó:

- fondos oscuros cálidos y grano sutil;
- tipografía editorial grande;
- imágenes horizontales y carátulas con jerarquías distintas;
- acento ámbar;
- secciones a pantalla completa en las superficies que se benefician de ello;
- scroll asistido suave, no secuestrado;
- tarjetas solo cuando ayudan a estructurar un catálogo.

La referencia conceptual fue una web promocional cinematográfica de alto nivel, pero adaptada a una aplicación privada y funcional.

### Calidad y datos antes que despliegue rápido

`main` está protegida. El proceso normal exige PR, pruebas, build, Preview y E2E autenticado. Los cambios delicados de datos requieren checkpoint y ensayo en Preview. Un despliegue manual de Vercel debe quedar después reflejado en `main` para evitar reversiones automáticas.

## Integraciones externas

### TMDb

Usos:

- búsqueda por título;
- metadatos, reparto, trailers, pósteres y backdrops;
- cartelera y próximos estrenos para España;
- candidatos para descubrimiento;
- nota externa mostrada como porcentaje TMDb cuando es la fuente disponible.

Comportamiento ante fallo: las funciones devuelven resultados vacíos o conservan metadatos existentes; el histórico propio sigue siendo accesible.

### Neon Postgres

- Base de datos gestionada para Preview y Producción.
- Las dos bases deben permanecer aisladas.
- Producción utiliza el historial/Time Travel y snapshots configurados en Neon como primera vía de recuperación.
- Configuración documentada durante el proyecto: siete días de historial, snapshots diarios a las 00:00 UTC, retención diaria de 14 días, semanal de 5 semanas y mensual de 1 mes. Verificar estos valores en la consola de Neon después de migrar de equipo, ya que son configuración externa y pueden cambiar.

### Vercel

- Proyecto enlazado: `cine-semanal`.
- Producción canónica: `https://cine-semanal.vercel.app`.
- Preview por rama/PR.
- Variables separadas por entorno.
- Funciones API en región `fra1`.
- La protección de Preview se omite solo para Playwright mediante un secreto dedicado.

### GitHub

- Repositorio canónico: `Chisma25/peliculas`.
- Rama de Producción: `main`, protegida.
- Integración de Vercel despliega `main` automáticamente.
- Workflows: calidad de PR, E2E autenticado, verificación de Producción y salud diaria.

## Modelo de datos

### Estado de dominio

`AppState` contiene:

- `users`: miembros y credenciales hasheadas;
- `group`: identidad del grupo y miembros;
- `movies`: catálogo propio con metadatos y IDs externos;
- `watchEntries`: películas vistas y fecha;
- `ratings`: nota/comentario por usuario y película;
- `pendingMovieIds`: archivo por ver;
- `weeklyBatches`: tandas y selección semanal;
- `activity`: contexto agregado de actividad.

### Tablas Prisma

- `UserRecord`: usuario, nombre, username único, email, avatar, hash y rol admin.
- `MovieRecord`: ID, slug único y metadatos completos en JSON.
- `PendingMovie`: relación lógica grupo–película, clave compuesta y fecha de alta.
- `WatchEntryRecord`: una entrada única por película vista, fecha y semana de selección.
- `RatingRecord`: una nota única por película y usuario, comentario y fecha.
- `WeeklyBatchRecord`: tanda semanal, grupo, semana y película elegida.
- `WeeklyBatchItemRecord`: películas de una tanda, posición, score, resumen, razones y métricas; única relación Prisma con borrado en cascada hacia su tanda.
- `AppSnapshot`: contexto agregado compacto.
- `TmdbCacheEntry`: estructura prevista para caché persistente; actualmente no es la ruta principal de caché.

Varias relaciones son lógicas y se validan desde la aplicación/scripts en vez de mediante claves foráneas Prisma. Por eso `db:health` es importante para detectar huérfanos o solapamientos.

## Estado actual de Producción

Estado comprobado el 2 de agosto de 2026:

- `main`: commit `f1cde3763a40615b12321db9e42a689325291d41` (“Añadir descubrimiento de películas”).
- Producción: `https://cine-semanal.vercel.app`.
- Vercel: despliegue completado correctamente para ese commit.
- Workflow `Verify production deployment`: correcto.
- Workflow `Daily production health`: correcto.
- Puerta de calidad de la PR #17: tests, lint, build, auditoría, Preview y Playwright autenticado correctos.
- No se aplicaron migraciones ni seeds al desplegar la función de descubrimiento.
- Los datos válidos siguen en la base de Producción; no se sustituyeron desde Preview.
- La última funcionalidad incorporada es descubrimiento de cinco películas bajo demanda en Explorar.

Los recuentos de películas, pendientes y valoraciones son datos vivos y no se fijan aquí para evitar que esta documentación quede obsoleta.

## Backups y recuperación

Sistema actual:

1. Historial y snapshots gestionados en Neon.
2. Checkpoints manuales JSON antes de operaciones delicadas.
3. Exportaciones verificables mediante checksum.
4. Health check e integridad después de cada recuperación.

Procedimiento recomendado ante una incidencia:

1. Detener nuevas escrituras y registrar la hora aproximada del problema.
2. Crear un checkpoint del estado actual si todavía es legible.
3. Usar `Backup & Restore` y `Preview data` de Neon para localizar un punto bueno.
4. Restaurar o inspeccionar primero una rama temporal.
5. Comparar recuentos, notas, pendientes, vistas y selección semanal.
6. Ejecutar `db:health` y un flujo real completo.
7. Restaurar `main` solo cuando el estado esté confirmado.
8. Crear un checkpoint posterior a la recuperación.

Los exports contienen datos privados y hashes; no subirlos al repositorio ni compartirlos en chats.

## Contexto local que no está en Git

En el equipo anterior quedaron elementos sin versionar:

- `design/`;
- `Respaldo-post-formateo/` y `Respaldo-post-formateo.zip`;
- scripts históricos para recuperar La odisea, El imperio contraataca y ajustar notas a cuartos;
- scripts auxiliares de exportación/restauración de una recuperación concreta.

No forman parte del clon y no deben confundirse con los scripts operativos versionados. Antes de formatear:

- conserva el respaldo en almacenamiento privado externo;
- confirma que incluye `.env` necesarios, checkpoints y exports que se quieran retener;
- no subas secretos ni datos de usuarios a Git;
- después de migrar, decide si los scripts históricos aún aportan valor o pueden archivarse fuera del proyecto.

## Próximos pasos recomendados

### Para migrar a otro equipo

1. Confirmar que la rama `main` remota contiene este documento y `AGENTS.md` después de su revisión y push.
2. Copiar a almacenamiento privado los `.env`, checkpoints, exports y `Respaldo-post-formateo*`.
3. Instalar Node 24 y clonar el repositorio.
4. Ejecutar `npm ci`, `npm test`, `npm run lint` y `npm run build`.
5. Crear `.env.local` desde la plantilla sin copiar valores en documentación.
6. Verificar acceso a GitHub, Vercel, Neon y TMDb.
7. Crear una rama pequeña de prueba, desplegar Preview y ejecutar Playwright autenticado.
8. Comprobar en Neon que historial y snapshots siguen activos.
9. Ejecutar el health check de Producción o confirmar el workflow diario.

### Para mantenimiento ordinario

1. Usar la aplicación con normalidad y registrar únicamente problemas reales.
2. Agrupar cambios visuales pequeños para evitar iteraciones innecesarias.
3. Mantener dependencias con PRs aisladas y toda la puerta de calidad.
4. Crear checkpoint antes de cualquier operación de datos.
5. Revisar trimestralmente cuotas de Neon/Vercel, backups y estado del monitor diario.

### Si se retoma desarrollo funcional

Antes de añadir una función, comprobar:

- que resuelve una necesidad del grupo y no una hipótesis comercial;
- que no duplica Vistas, Pendientes, radar o descubrimiento;
- que no aumenta consultas de Neon/TMDb en cada navegación sin aportar valor;
- que mantiene Preview y Producción aisladas;
- que tiene estados vacío, carga, error, móvil y accesibilidad básica;
- que existe una prueba que impida repetir los fallos de datos o sincronización ya resueltos.
