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

## Stack

- Next.js + TypeScript
- PostgreSQL via Prisma
- TMDb como fuente externa para busquedas, posters y enriquecimiento de metadatos
- Vitest para pruebas de reglas

## Desarrollo local

1. Instala Node.js 20 o superior.
2. Copia `.env.example` a `.env.local`.
3. Rellena `TMDB_API_KEY`.
4. Instala dependencias con `npm install`.
5. Arranca con `npm run dev`.

Si no rellenas `DATABASE_URL`, la app funciona en local con `data/runtime-state.json`.

## Cuentas iniciales del grupo

- `Isma` / `Roca7!Marea`
- `Vargues` / `Niebla4!Faro`
- `Meneses` / `Tinta9!Clave`
- `Jose` / `Atlas6!Cobre`
- `Javi` / `Bruma8!Lince`
- `Huguito` / `Trama5!Sable`

## Preparar despliegue en Vercel + Supabase

1. Crea un proyecto de Postgres en Supabase.
2. En Supabase abre `Connect` y copia:
   - `DATABASE_URL`: la cadena pooler para runtime con `?pgbouncer=true`
   - `DIRECT_URL`: la conexion directa para Prisma CLI
3. Ejecuta:

```bash
npm install
npm run db:push
npm run db:seed
```

4. Sube el repo a GitHub.
5. Importa el proyecto en Vercel.
6. En Vercel configura estas variables:

```env
DATABASE_URL=...
DIRECT_URL=...
APP_SNAPSHOT_ID=main
TMDB_API_KEY=...
ADMIN_RESET_CODE=...
```

7. Despliega.

`npm run db:seed` vuelca vuestro estado actual de `data/runtime-state.json` a la tabla `AppSnapshot`, para que el grupo arranque en producción con las mismas peliculas, notas, pendientes y usuarios.

Para Supabase + Prisma, la recomendacion oficial es usar runtime con pooler y CLI con conexion directa. Prisma documenta esta separacion con `DATABASE_URL` y `DIRECT_URL`, y Supabase documenta sus variantes `direct`, `session` y `transaction` desde el panel `Connect`.

## Notas de implementacion

- La importacion desde Excel ya no forma parte de la interfaz: el historico del grupo esta cargado manualmente en el estado inicial.
- La persistencia remota actual usa un snapshot JSON completo del estado de la app en PostgreSQL.
- Esto simplifica el despliegue inmediato y deja margen para normalizar tablas mas adelante.
- Si no existe `TMDB_API_KEY`, la app sigue funcionando, pero no podra enriquecer peliculas ni mostrar caratulas reales.
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
