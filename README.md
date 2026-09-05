# Cine Semanal

Aplicación privada para un grupo que comparte películas vistas, notas individuales, pendientes y recomendaciones. Sustituye un Excel compartido y está diseñada alrededor de un único grupo.

Incluye búsqueda y descubrimiento con TMDb, selección semanal, fichas de películas, perfiles, estadísticas y gestión de accesos. Las notas van de 0 a 10 en incrementos de 0,25; marcar una película como vista la retira de Pendientes.

## Documentación

| Necesito… | Guía |
| --- | --- |
| Entender las pantallas y reglas del producto | [Funcionalidad](docs/funcionalidad.md) |
| Localizar el código y entender los datos | [Arquitectura](docs/arquitectura.md) |
| Instalar, configurar y ejecutar pruebas | [Desarrollo](docs/desarrollo.md) |
| Desplegar, diagnosticar o recuperar datos | [Operación](docs/operacion.md) |
| Consultar permisos, parámetros y respuestas HTTP | [API](docs/api.md) |
| Saber qué se ha corregido y qué queda pendiente | [Estado del proyecto](docs/estado-proyecto.md) |

## Arranque local

Requiere Node.js **24.x** y npm. Desde la raíz del repositorio, en PowerShell:

```powershell
Copy-Item .env.example .env.local
npm ci
```

Edita `.env.local`: cambia `ADMIN_RESET_CODE` y `SESSION_SECRET` por valores privados; añade `TMDB_API_KEY` si quieres búsquedas externas. Mantén `DATABASE_URL` vacío para trabajar con el archivo local. Después:

```powershell
npm run dev
```

Abre [la aplicación local](http://localhost:3000). La primera ejecución prepara el estado inicial; en `/reset-credenciales` puedes asignar una contraseña a una cuenta inicial usando tu código local. No existe registro público de cuentas. Consulta [el primer acceso](docs/desarrollo.md#primer-acceso) antes de conectar una base de datos.

## Comprobaciones habituales

```powershell
npm test
npm run lint
npm run build
npm run test:security
```

Las pruebas de navegador y concurrencia con PostgreSQL tienen una preparación adicional descrita en [Desarrollo](docs/desarrollo.md#pruebas).

## Stack y entrega

Next.js 16, React 19, TypeScript, Prisma 6 y PostgreSQL; Vercel publica desde GitHub y Neon aloja los datos. Las versiones exactas están en [package.json](package.json) y [package-lock.json](package-lock.json).

Repositorio: [Chisma25/peliculas](https://github.com/Chisma25/peliculas). Aplicación: [Cine Semanal](https://cine-semanal.vercel.app). Una PR debe superar `quality` y `authenticated-preview` antes de integrarse en `main`; `/api/version` permite comprobar el commit realmente desplegado.

**`db:seed` es una carga inicial que reemplaza colecciones de datos. No se ejecuta en despliegues habituales ni como paso automático tras cambiar el esquema.** Sigue la [guía de operación](docs/operacion.md) para preparar instalaciones o cambios de base de datos.

Al cambiar comportamiento, configuración o procedimientos, actualiza la guía correspondiente en la misma PR. La documentación describe el código vigente; las entregas históricas tienen su fecha y referencia en [Estado del proyecto](docs/estado-proyecto.md).
