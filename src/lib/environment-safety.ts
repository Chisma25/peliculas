type EnvironmentVariables = Record<string, string | undefined>;

export type AppEnvironment = "development" | "test" | "preview" | "production";
export type DatabaseEnvironment = "development" | "preview" | "production";

const REMOTE_DATABASE_OVERRIDE = "ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT";

function parseAppEnvironment(value?: string): AppEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "development" ||
    normalized === "test" ||
    normalized === "preview" ||
    normalized === "production"
  ) {
    return normalized;
  }

  return null;
}

function parseDatabaseEnvironment(value?: string): DatabaseEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "development" || normalized === "preview" || normalized === "production") {
    return normalized;
  }

  return null;
}

function environmentFromVercel(value?: string): AppEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production" || normalized === "preview" || normalized === "development") {
    return normalized;
  }

  return null;
}

export function resolveAppEnvironment(environment: EnvironmentVariables = process.env): AppEnvironment {
  const configuredEnvironment = parseAppEnvironment(environment.APP_ENV);
  const vercelEnvironment = environmentFromVercel(environment.VERCEL_ENV);

  if (configuredEnvironment && vercelEnvironment && configuredEnvironment !== vercelEnvironment) {
    throw new Error(
      `APP_ENV=${configuredEnvironment} no coincide con VERCEL_ENV=${vercelEnvironment}. Revisa las variables del despliegue.`
    );
  }

  if (configuredEnvironment) {
    return configuredEnvironment;
  }

  if (vercelEnvironment) {
    return vercelEnvironment;
  }

  if (environment.NODE_ENV === "test") {
    return "test";
  }

  return "development";
}

function getDatabaseHostname(databaseUrl: string) {
  try {
    const parsedUrl = new URL(databaseUrl);
    if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
      throw new Error();
    }
    return parsedUrl.hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL no es una URL PostgreSQL válida.");
  }
}

function isLocalDatabaseHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

export function assertDatabaseEnvironmentSafety(environment: EnvironmentVariables = process.env) {
  const databaseUrl = environment.DATABASE_URL?.trim();
  const appEnvironment = resolveAppEnvironment(environment);
  if (!databaseUrl) {
    return {
      appEnvironment,
      databaseEnvironment: null,
      databaseHostname: null,
      usesDatabase: false
    };
  }

  const databaseHostname = getDatabaseHostname(databaseUrl);
  const databaseEnvironment = parseDatabaseEnvironment(environment.DATABASE_ENVIRONMENT);
  const productionDatabaseHostname = environment.PRODUCTION_DATABASE_HOST?.trim().toLowerCase() || null;
  const localDatabase = isLocalDatabaseHost(databaseHostname);

  if (appEnvironment === "development" || appEnvironment === "test") {
    if (!localDatabase) {
      const explicitlyAllowed = environment[REMOTE_DATABASE_OVERRIDE]?.trim().toLowerCase() === "true";
      if (!explicitlyAllowed || databaseEnvironment !== "development") {
        throw new Error(
          `Se ha bloqueado una base remota desde ${appEnvironment}. Usa una base local o configura ` +
            `${REMOTE_DATABASE_OVERRIDE}=true y DATABASE_ENVIRONMENT=development de forma explícita.`
        );
      }
    } else if (databaseEnvironment && databaseEnvironment !== "development") {
      throw new Error(
        `DATABASE_ENVIRONMENT=${databaseEnvironment} no es válido para una ejecución local de desarrollo.`
      );
    }
  } else {
    if (localDatabase) {
      throw new Error(`El entorno ${appEnvironment} no puede utilizar una base de datos local.`);
    }

    if (!databaseEnvironment) {
      throw new Error(`DATABASE_ENVIRONMENT es obligatorio en ${appEnvironment}.`);
    }

    if (databaseEnvironment !== appEnvironment) {
      throw new Error(
        `La aplicación ${appEnvironment} no puede utilizar una base etiquetada como ${databaseEnvironment}.`
      );
    }

    if (!productionDatabaseHostname) {
      throw new Error(`PRODUCTION_DATABASE_HOST es obligatorio en ${appEnvironment}.`);
    }

    if (appEnvironment === "production" && databaseHostname !== productionDatabaseHostname) {
      throw new Error("DATABASE_URL no apunta al host de producción declarado.");
    }

    if (appEnvironment === "preview" && databaseHostname === productionDatabaseHostname) {
      throw new Error("Un despliegue Preview no puede utilizar el host de la base de producción.");
    }
  }

  return {
    appEnvironment,
    databaseEnvironment,
    databaseHostname,
    usesDatabase: true
  };
}
