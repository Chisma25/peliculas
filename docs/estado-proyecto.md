# Estado del proyecto y decisiones

[Inicio](../README.md) · [Arquitectura](arquitectura.md) · [Operación](operacion.md)

Revisión documental: **6 de septiembre de 2026**. Base funcional inicial de esta documentación: `0542d31` (PR #21); la organización del código se actualiza con cada extracción descrita abajo. Este documento reúne el contexto útil del análisis inicial que se conservaba fuera del repositorio; no copia datos personales, secretos ni exports. Los apartados actuales sustituyen el diagnóstico antiguo como referencia de trabajo.

Infraestructura consultada el 5 de septiembre de 2026: Neon PostgreSQL **17**, región `aws-eu-central-1`. La suite de concurrencia utiliza PostgreSQL **16** desechable en CI; esta diferencia de versión se debe tener en cuenta al introducir SQL específico de una versión.

## Entregas realizadas

| Entrega | Resultado | Evidencia histórica |
| --- | --- | --- |
| [PR #20](https://github.com/Chisma25/peliculas/pull/20), `47cb57e` | Rol administrativo explícito, proyección pública de perfiles, sesiones vinculadas a credenciales y recuperación de lectura sin snapshot | 134 pruebas generales; seguridad HTTP, build, lint y auditoría aprobados; Preview 39 pruebas de navegador aprobadas y 5 omitidas; identidad y salud de Producción verificadas |
| [PR #21](https://github.com/Chisma25/peliculas/pull/21), `0542d31` | Lectura y escritura de mutaciones bajo bloqueo compartido; cola local; rechazo de selección ya vista | 143 pruebas generales; ejecución de concurrencia con 19 casos aprobados y 1 omitido entre variantes local/PostgreSQL; Preview 39 aprobadas y 5 omitidas; identidad y salud de Producción verificadas |
| [PR #23](https://github.com/Chisma25/peliculas/pull/23), `21be03d` | Separación de registros, autenticación, edición y perfiles de usuarios | 148 pruebas generales; concurrencia con 19 casos aprobados y 1 omitido; Preview 39 aprobadas y 5 omitidas; identidad y salud de Producción verificadas |
| [PR #24](https://github.com/Chisma25/peliculas/pull/24), `d2d1171` | Separación de películas, pendientes, vistas y notas | 152 pruebas generales; concurrencia con 19 casos aprobados y 1 omitido; Preview 39 aprobadas y 5 omitidas; identidad y salud de Producción verificadas |
| [PR #25](https://github.com/Chisma25/peliculas/pull/25), `6dbafb6` | Separación de recomendaciones y preparación de páginas | 158 pruebas generales; concurrencia con 19 casos aprobados y 1 omitido; Preview 39 aprobadas y 5 omitidas; identidad y salud de Producción verificadas |
| [PR #26](https://github.com/Chisma25/peliculas/pull/26), `19ad8c1` | Coordinación de las escrituras de metadatos y renovación de tandas durante lecturas | 161 pruebas generales; concurrencia con 23 casos aprobados y 5 omitidos; Preview 39 aprobadas y 5 omitidas; identidad y salud de Producción verificadas |

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

Las tres etapas de separación están implementadas: usuarios; películas y notas; recomendaciones y datos de páginas. `src/lib/recommendations/` coordina tandas y sugerencias, y `src/lib/pages/` prepara inicio, pendientes, vistas, perfiles y fichas. Los índices compartidos están en `state-readers.ts`. Se mantienen los exports públicos y el coordinador común; el store conserva composición, carga de estado, disponibilidad, persistencia y compatibilidad histórica.

La tercera etapa añadió regresiones de historial, paginación, notas por usuario e invalidación entre pantallas. La entrega posterior coordina las dos escrituras durante lecturas que se detectaron entonces: renovar la tanda desde Pendientes y guardar metadatos enriquecidos. Ambas usan el bloqueo compartido y el guardado conjunto del snapshot. Incluye pruebas de respuestas tardías, lecturas concurrentes, rollback y reintento. Los límites se explican en [Arquitectura](arquitectura.md#escrituras-y-concurrencia).

| Área | Siguiente trabajo | Criterio de cierre |
| --- | --- | --- |
| Organización del código | Evaluar separar la infraestructura de carga, disponibilidad y compatibilidad histórica si dificulta los siguientes cambios | Responsabilidades claras y mejora justificada; las tres extracciones funcionales están completadas |
| Experiencia de uso | Completar una comprobación en móviles físicos, incluyendo teclado de iOS y Android | La revisión en navegador con tamaños móviles está hecha; la simulación de anchura y altura no sustituye al teclado real |
| Integridad de datos | Evaluar relaciones foráneas e historial de migraciones; revisar datos existentes antes de añadir restricciones | Plan compatible con la base real, probado en Preview y con vuelta atrás |
| Herramientas administrativas | Revisar consistencia de exports y coordinación de scripts con escrituras del grupo | Copias consistentes y operaciones administrativas con garantías explícitas; hoy exigen coordinación del operador |
| Estadísticas | Revisar la exclusión de medias iguales a cero en el resumen global | Regla acordada y prueba que cubra notas cero y ausencia de notas por separado |
| Escala y seguridad | Reevaluar bloqueo global y rate limiting por instancia si se amplía el uso | Cambios justificados por la carga y los requisitos, con pruebas adecuadas |

La documentación se ha separado en guías de funcionalidad, arquitectura, desarrollo, operación y API. La instrucción antigua de sembrar datos tras cambiar el esquema queda retirada. Esto no implica haber implementado las mejoras de la tabla anterior.

## Revisión de uso en navegador

El 6 de septiembre de 2026 se revisaron búsqueda, alta en Pendientes, elección semanal, marcado como vista y creación/edición de notas con una cuenta y datos locales sintéticos. Se comprobaron anchuras de 320, 360 y 390 píxeles, escritorio de 1366 píxeles y un diálogo con 500 píxeles de altura disponible. No se modificaron las películas ni notas de Producción.

Se corrigieron el título de Pendientes recortado, los márgenes de Explorar, el solapamiento de sus marcos decorativos y de los textos de la navegación inferior. Explorar ofrece un enlace visible a la búsqueda desde su primera pantalla. La valoración acepta coma y punto, muestra el límite del comentario y espera a que el botón sea interactivo para admitir clics. Los E2E cubren tamaños estrechos, entrada decimal, rechazo de notas inválidas y conservación del foco; la prueba de guardado real en Preview también introduce una coma.

La prueba local sin base de datos puede mostrar temporalmente una lectura anterior tras guardar, debido a las cachés en memoria de las rutas en desarrollo. Los guardados se comprobaron en el archivo sintético; la actualización inmediata de la nota con PostgreSQL se comprueba por separado en Preview. La generación externa de propuestas no se probó manualmente contra TMDb en esta revisión local sin clave. Sigue pendiente contrastar el teclado y la interacción táctil en dispositivos físicos.

## Mantener esta documentación

Cada PR debe actualizar las guías afectadas. Cambios de ruta o formularios van a API; reglas y pantallas a Funcionalidad; persistencia a Arquitectura; comandos y variables a Desarrollo/Operación. Registrar aquí las decisiones o entregas relevantes sin convertir la guía principal en un historial de incidencias.

En datos externos, indicar fecha de comprobación y origen: por ejemplo, la programación de copias se configura en Neon y no se deduce del código. Mantener los ejemplos sin secretos y comprobar enlaces a archivos y nombres de comandos. Si una limitación se corrige, actualizar tanto su explicación técnica como la tabla de pendientes.
