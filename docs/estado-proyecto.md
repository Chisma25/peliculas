# Estado del proyecto y decisiones

[Inicio](../README.md) · [Arquitectura](arquitectura.md) · [Operación](operacion.md)

Revisión documental: **5 de septiembre de 2026**. Base funcional inicial de esta documentación: `0542d31` (PR #21); la organización del código se actualiza con cada extracción descrita abajo. Este documento reúne el contexto útil del análisis inicial que se conservaba fuera del repositorio; no copia datos personales, secretos ni exports. Los apartados actuales sustituyen el diagnóstico antiguo como referencia de trabajo.

Infraestructura consultada en esa fecha: Neon PostgreSQL **17**, región `aws-eu-central-1`. La suite de concurrencia utiliza PostgreSQL **16** desechable en CI; esta diferencia de versión se debe tener en cuenta al introducir SQL específico de una versión.

## Entregas realizadas

| Entrega | Resultado | Evidencia histórica |
| --- | --- | --- |
| [PR #20](https://github.com/Chisma25/peliculas/pull/20), `47cb57e` | Rol administrativo explícito, proyección pública de perfiles, sesiones vinculadas a credenciales y recuperación de lectura sin snapshot | 134 pruebas generales; seguridad HTTP, build, lint y auditoría aprobados; Preview 39 pruebas de navegador aprobadas y 5 omitidas; identidad y salud de Producción verificadas |
| [PR #21](https://github.com/Chisma25/peliculas/pull/21), `0542d31` | Lectura y escritura de mutaciones bajo bloqueo compartido; cola local; rechazo de selección ya vista | 143 pruebas generales; ejecución de concurrencia con 19 casos aprobados y 1 omitido entre variantes local/PostgreSQL; Preview 39 aprobadas y 5 omitidas; identidad y salud de Producción verificadas |

En PR #21 las nueve nuevas regresiones locales fallaban sobre el código anterior. La variante PostgreSQL añadió una avería real al guardar el snapshot y verificó que la modificación de la cuenta se deshacía completa. El caso específico de PostgreSQL se omite en la variante local. Los E2E incluyen casos condicionales; sus omisiones no representan cobertura completa de todas las acciones.

Los fallos de permisos por nombre, exposición de hashes, sesiones no revocadas y lectura sin snapshot del análisis inicial están corregidos. Las entregas anteriores son evidencia fechada, no una afirmación de que un despliegue futuro esté verificado. Para conocer el commit servido ahora, usar `/api/version` y [el procedimiento de entrega](operacion.md#entrega-habitual).

## Decisiones vigentes

- Mantener una aplicación para un grupo único, con notas personales y listas/elección compartidas.
- Usar tablas normalizadas como fuente de verdad; el snapshot solo aporta contexto agregado.
- Rechazar fallos de lectura en despliegues antes que devolver datos locales como si fueran los reales.
- Coordinar las mutaciones de todas las instancias con un bloqueo de PostgreSQL; publicar la caché tras el commit.
- Separar datos de Preview y Producción; probar con cuentas y datos dedicados.
- Entregar por PR, comprobaciones obligatorias, despliegue automático y verificación del dominio.
- Conservar la recomendación basada en reglas y ponderaciones; su puntuación no se presenta como probabilidad.

## Trabajo pendiente

La primera extracción de usuarios está implementada en `src/lib/users/`: registros, autenticación, edición de cuentas y cálculos de perfil. Conserva los exports del store y el coordinador transaccional común. Incluye regresiones para credenciales vigentes, representación de avatares, estadísticas y cachés. La orquestación de lecturas y páginas permanece en el store; no se ha completado la separación de todos los dominios.

| Área | Siguiente trabajo | Criterio de cierre |
| --- | --- | --- |
| Organización del código | Continuar con películas, valoraciones, recomendaciones y preparación de páginas tras la extracción inicial de usuarios | Responsabilidades claras, comportamiento conservado y regresiones aprobadas en cada paso |
| Experiencia de uso | Revisión visual manual, especialmente móvil, del recorrido buscar → pendiente → elegir → vista → valorar | Hallazgos concretos corregidos y comprobados en navegador; los E2E actuales no sustituyen esta revisión |
| Integridad de datos | Evaluar relaciones foráneas e historial de migraciones; revisar datos existentes antes de añadir restricciones | Plan compatible con la base real, probado en Preview y con vuelta atrás |
| Herramientas administrativas | Revisar consistencia de exports y coordinación de scripts con escrituras del grupo | Copias consistentes y operaciones administrativas con garantías explícitas; hoy exigen coordinación del operador |
| Estadísticas | Revisar la exclusión de medias iguales a cero en el resumen global | Regla acordada y prueba que cubra notas cero y ausencia de notas por separado |
| Escala y seguridad | Reevaluar bloqueo global y rate limiting por instancia si se amplía el uso | Cambios justificados por la carga y los requisitos, con pruebas adecuadas |

La documentación se ha separado en guías de funcionalidad, arquitectura, desarrollo, operación y API. La instrucción antigua de sembrar datos tras cambiar el esquema queda retirada. Esto no implica haber implementado las mejoras de la tabla anterior.

## Mantener esta documentación

Cada PR debe actualizar las guías afectadas. Cambios de ruta o formularios van a API; reglas y pantallas a Funcionalidad; persistencia a Arquitectura; comandos y variables a Desarrollo/Operación. Registrar aquí las decisiones o entregas relevantes sin convertir la guía principal en un historial de incidencias.

En datos externos, indicar fecha de comprobación y origen: por ejemplo, la programación de copias se configura en Neon y no se deduce del código. Mantener los ejemplos sin secretos y comprobar enlaces a archivos y nombres de comandos. Si una limitación se corrige, actualizar tanto su explicación técnica como la tabla de pendientes.
