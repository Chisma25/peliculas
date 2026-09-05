# Funcionalidad y reglas

[Inicio](../README.md) · [Arquitectura](arquitectura.md) · [API](api.md)

## Recorrido principal

1. Entrar con usuario y contraseña.
2. Buscar una película o descubrir propuestas en Explorar.
3. Añadirla a Pendientes, si todavía no está pendiente ni vista.
4. Elegir la película semanal desde la tanda actual o desde Pendientes.
5. Marcarla como vista para el grupo.
6. Guardar una nota y un comentario propios; consultar las notas de los demás.

Es el recorrido habitual, no una cadena obligatoria: valorar una película existente no exige haberla marcado antes como vista, y elegirla para la semana no la marca automáticamente como vista.

## Pantallas

| Ruta | Contenido |
| --- | --- |
| `/` | Película seleccionada, recomendaciones, estadísticas, cartelera y próximos estrenos |
| `/vistas` | Historial del grupo con búsqueda, filtros, ordenación y notas |
| `/pendientes` | Candidatas guardadas y hasta cinco sugerencias entre ellas |
| `/explorar` | Descubrimiento de películas y regeneración de propuestas |
| `/peliculas/[slug]` | Metadatos, notas del grupo y valoración propia |
| `/perfil` | Datos propios, avatar, credenciales y estadísticas personales |
| `/grupo` y `/grupo/[username]` | Miembros y perfiles consultables del grupo |
| `/login` | Acceso con credenciales |
| `/reset-credenciales` | Recuperación mediante código de administración |

Las páginas del grupo requieren sesión. Los perfiles ajenos son de consulta; los administradores gestionan accesos mediante una acción específica. La ruta de compatibilidad [`/catalogo`](../app/catalogo/page.tsx) redirige a `/vistas`.

## Películas, listas y notas

- Hay un único grupo. Pendientes y Vistas son compartidas, no listas personales.
- Una película solo tiene un registro de visionado. No hay historial de múltiples visionados de la misma película.
- Añadir a Pendientes devuelve `added`, `already_pending` o `already_watched`. La identificación busca coincidencia TMDb y, como alternativa, slug y año.
- Marcar como vista retira la película de Pendientes. Repetir la operación conserva el registro existente; rellena la fecha si faltaba y elimina un pendiente residual.
- Quitar de Pendientes no elimina la película del catálogo, sus notas ni su historial.
- Cada persona tiene como máximo una valoración por película. Guardar de nuevo actualiza esa nota y comentario.
- Las notas admiten **0–10**, incluidos ambos extremos, en pasos de **0,25**. Un comentario puede tener hasta **1.000 caracteres**; vacío elimina su contenido.
- La media de una película se calcula con sus notas registradas. Actualmente el resumen global promedia las medias de películas vistas cuyo valor es mayor que cero: una media cero queda excluida de ese resumen. Es una limitación a revisar, no una restricción para puntuar con cero.

Fuentes: [store.ts](../src/lib/store.ts), [user-input.ts](../src/lib/user-input.ts), [types.ts](../src/lib/types.ts) y [schema.prisma](../prisma/schema.prisma).

## Recomendaciones y elección semanal

La tanda propone hasta **tres** películas del catálogo que no están vistas ni pendientes. Pendientes ofrece hasta **cinco** alternativas de esa lista, excluyendo la selección destacada. Puede haber menos propuestas si faltan candidatas válidas.

Para recomendar o elegir se exige título no vacío, año entero positivo y al menos un género válido distinto de «Pendiente». Solo se puede elegir una película de la tanda vigente o una pendiente; se rechazan tandas antiguas y películas ya vistas.

La tanda se puede generar manualmente. También puede renovarse al obtener la tanda actual cuando ya no es válida. No existe un cron que genere recomendaciones cada semana. Al renovar, se conserva una selección anterior únicamente cuando sigue pendiente, no está vista y tiene metadatos válidos.

El recomendador combina afinidad por géneros, dirección, reparto, idioma, época, duración y conceptos del contenido con calidad externa, variedad y decisiones anteriores. Usa reglas y ponderaciones, no un modelo de lenguaje. Su puntuación es relativa a las candidatas; no es una probabilidad de acierto. Explorar obtiene candidatas de TMDb a partir del historial y permite excluir propuestas ya mostradas.

Fuentes: [recommendations.ts](../src/lib/recommendations.ts), [recommendation-primitives.ts](../src/lib/recommendation-primitives.ts) y [weekly-selection.ts](../src/lib/weekly-selection.ts).

## Cuentas y permisos

Todos los miembros autenticados pueden gestionar las listas y la selección compartidas y editar sus propias notas y perfil. La administración permite cambiar usuario y contraseña de otra cuenta. El código de recuperación restablece credenciales; no concede el rol de administrador.

El nombre visible admite 2–60 caracteres, el usuario 3–32 y la contraseña 8–128. La comparación de usuarios normaliza acentos, mayúsculas y separadores; no basta con cambiar mayúsculas para crear un usuario diferente.

Cambiar una contraseña invalida las sesiones anteriores. Si se cambia desde el perfil, ese navegador recibe una sesión renovada. El resto debe entrar de nuevo. Renombrarse no concede permisos: estos dependen de `isAdmin`.

## Cambios simultáneos

Las operaciones normales de la app se serializan en PostgreSQL antes de leer y validar el estado. Conservan notas de distintas personas y evitan sobrescribir credenciales o dejar una película en ambas listas. Para dos cambios sobre el mismo campo, prevalece el último confirmado. Los detalles y límites de esta garantía están en [Arquitectura](arquitectura.md#escrituras-y-concurrencia).
