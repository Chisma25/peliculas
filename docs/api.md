# Referencia HTTP

[Inicio](../README.md) · [Reglas funcionales](funcionalidad.md) · [Arquitectura](arquitectura.md)

API interna de la aplicación, sin versionado público. Las rutas implementadas en [app/api](../app/api) son la referencia para cambiar contratos. Base local: `http://localhost:3000`; base desplegada: `https://cine-semanal.vercel.app`.

## Convenciones

- **Sesión** significa cookie `cine.session` obtenida por login. La identidad de las notas y del perfil se toma de la sesión, no de un `userId` enviado por el cliente.
- Los POST reciben **FormData** salvo `/api/pending/add`, que recibe JSON. Campos no marcados como opcionales deben enviarse.
- Los POST activos comprueban Origin o Referer cuando existen. Un origen incompatible recibe 403; sin ambas cabeceras no se rechaza por este control. No hay un token CSRF adicional.
- Sin sesión, el proxy devuelve 401 a API protegidas y redirige las páginas a login con 303. Las rutas de autenticación, versión y salud pasan el proxy; salud exige su propio Bearer.
- Éxito JSON usa 200 salvo indicación. Las redirecciones usan 303. Para inspeccionar una redirección con `fetch`, usar `redirect: "manual"`.
- El error habitual es `{ "error": "mensaje" }`. Fallos operativos tratados pueden añadir `incidentId`; indisponibilidad de datos usa 503 y `Retry-After: 30`. La salud tiene un formato propio. Algunas rutas utilizan 400 también para errores de negocio capturados; no interpretar todo error como fallo de conexión.

## Acceso y cuentas

| Método y ruta | Permiso | Entrada | Éxito y errores particulares |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Público | FormData: `username`, `password` | 200 `{message, userId, redirectTo: "/"}` y cookie; 401 credenciales incorrectas; 503 sesión no configurable |
| `POST /api/auth/logout` | Público | Sin campos requeridos | 303 a `/login`, elimina cookie |
| `POST /api/auth/reset-credentials` | Código de recuperación | FormData: `adminCode`, `identifier`, `username`, `password` | 200 `{message}`; 400 datos/código inválidos o reset no configurado. No inicia sesión |
| `POST /api/auth/request-link` | Público | No se utiliza | Siempre 410: acceso por magic link retirado |
| `POST /api/auth/verify` | Público | No se utiliza | Siempre 410: acceso por magic link retirado |
| `POST /api/profile/update` | Sesión | FormData: `name`, `username`; opcionales `password`, `avatarAction`, `avatarDataUrl` | 200 `{message, avatarUrl}`; `avatarUrl` puede ser null. Contraseña nueva renueva la cookie. 400 validación |
| `POST /api/admin/users/update` | Sesión administradora | FormData: `userId`, `username`; opcional `password` | 200 `{message}`; 403 miembro sin permisos; 400 validación. No cambia `isAdmin` |
| `GET /api/users/[id]/avatar` | Sesión, mediante proxy | ID en ruta; `v` opcional | 200 imagen optimizada; 404 sin avatar. Usa PostgreSQL directamente; no ofrece lectura alternativa del archivo local |

`identifier` busca usuario o nombre visible normalizado. `password` vacío en perfil/administración conserva la contraseña. `avatarAction` admite `keep` (por defecto), `remove` y `replace`; esta última necesita `avatarDataUrl`. El avatar admite data URL base64 PNG/JPEG/JPG/WEBP/GIF de hasta 2.000.000 caracteres. La entrega con `v` usa caché privada de un año e inmutable; sin `v`, privada sin almacenamiento.

Validación de cuentas: nombre 2–60 caracteres, usuario 3–32, contraseña nueva 8–128. Ver [user-input.ts](../src/lib/user-input.ts) para normalización y saneamiento exactos.

Límites de intentos por dirección y bucket: login **8/10 minutos**, reset **5/15 minutos**, administración **20/10 minutos**. Al superarlos, 429 con `Retry-After`. El contador reside en cada instancia; no es un límite distribuido.

## Películas, notas y listas

Todas estas rutas requieren sesión.

| Método y ruta | Entrada | Éxito y errores particulares |
| --- | --- | --- |
| `GET /api/movies/search` | Query `q`, opcional; se recorta y limita a 120 caracteres | 200 `{results: Movie[]}`; cada resultado puede incluir `collectionStatus: already_pending` o `already_watched`. 400 si búsqueda demasiado larga |
| `GET /api/movies/discover` | Query `generation` (0 por defecto, acotada a 0–50), `exclude` (IDs TMDb numéricos separados por comas, únicos, hasta 30) | 200 `{generation, results}`; propuestas de descubrimiento, hasta cinco. Caché `private, no-store` |
| `POST /api/pending/add` | JSON: objeto `Movie`, preferentemente devuelto por búsqueda/descubrimiento | 200 `{status, movie, message}`; status `added`, `already_pending` o `already_watched`. 400 JSON/película inválidos; 413 tamaño; 415 tipo de contenido |
| `POST /api/pending/remove` | FormData: `movieId`; opcional `redirectTo` (por defecto `/pendientes`) | 303 al destino interno, incluso si ya no estaba pendiente; 400 ID vacío |
| `POST /api/watch/mark-watched` | FormData: `movieId`; opcional `redirectTo` (por defecto `/`) | 303 al destino interno; con `Accept: application/json`, 200 `{status: "watched"}`. 400 ID ausente o película inexistente |
| `POST /api/ratings/create-or-update` | FormData: `movieId`, `score`; opcional `comment` | 200 `{message}`; 400 si nota no válida, comentario demasiado largo o referencia inexistente |
| `GET /api/history/list` | Query opcionales `search`, `genre`, `year` | 200 `{history}`; cada elemento contiene `movie`, `watchedOn`, `groupAverage`, `ratings`, `userRating` cuando exista |

`Movie` está definido en [types.ts](../src/lib/types.ts): ID, slug, título, año, sinopsis, duración, géneros, dirección, reparto, idioma, país y nota externa; imágenes, fechas y `sourceIds` son opcionales. Los IDs TMDb se representan como cadenas. Para añadir una película, reutiliza el objeto completo recibido; la validación HTTP actual comprueba solo parte de ese contrato (título no vacío de hasta 200 caracteres y tipo de ID TMDb), no todos sus campos.

El JSON de pendientes se limita a **256.000 bytes**. `redirectTo` debe ser una ruta interna que comience por `/` y no por `//`; de lo contrario se usa el destino predeterminado. La nota debe ser 0–10 en pasos de 0,25, y el comentario hasta 1.000 caracteres. La API de historial no expone el parámetro de ordenación de la página de Vistas.

## Selección semanal

| Método y ruta | Permiso | Entrada | Respuesta |
| --- | --- | --- | --- |
| `POST /api/weekly-recommendations/generate` | Sesión | Sin campos requeridos | 303 a `/`; crea una tanda |
| `POST /api/weekly-recommendations/select` | Sesión | FormData: `batchId`, `movieId` | 303 a `/`; 400 si tanda antigua/inexistente, película vista o selección no admitida |

No hace falta ser administrador. El ID de tanda debe ser el actual y la película debe pertenecer a esa tanda o a Pendientes. La generación y la elección son operaciones distintas; ver [las reglas](funcionalidad.md#recomendaciones-y-elección-semanal).

## Diagnóstico

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /api/version` | Público | 200 `{commitSha, shortCommitSha, commitRef, environment, deploymentUrl}` sin caché; en local puede usar `local` como commit |
| `GET /api/health` | `Authorization: Bearer HEALTHCHECK_SECRET` | 200 `{service, status: "ok", checkedAt, deployment, counts, issues}`; 503 `degraded` con incidencias o `unavailable` con `incidentId`; 401 `{status: "unauthorized"}` si falta o no coincide el secreto |

Salud no devuelve credenciales ni datos personales. No utilices el secreto de salud como credencial de una sesión normal.

## Ejemplos desde un navegador autenticado

Estos ejemplos operan sobre la sesión actual y deben probarse en local o Preview con datos preparados.

```javascript
const searchResponse = await fetch('/api/movies/search?q=Alien');
const { results } = await searchResponse.json();
// Revisa la película elegida antes de ejecutar una acción.
let selectedMovie = results[0];
```

```javascript
const addResponse = await fetch('/api/pending/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(selectedMovie)
});
const addition = await addResponse.json();
if (!addResponse.ok) throw new Error(addition.error);
selectedMovie = addition.movie; // Conserva el ID definitivo del catálogo.
// addition.status distingue una incorporación de una película ya existente.
```

```javascript
const form = new FormData();
form.set('movieId', selectedMovie.id);
form.set('score', '8.25');
form.set('comment', 'Comentario de prueba');
const response = await fetch('/api/ratings/create-or-update', {
  method: 'POST', body: form
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
```

Usa el `movie.id` devuelto por la incorporación si su ID cambia al guardarse. No envíes hashes, rol ni un usuario alternativo en estas peticiones.
