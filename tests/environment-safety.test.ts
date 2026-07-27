import { describe, expect, it } from "vitest";

import { assertDatabaseEnvironmentSafety, resolveAppEnvironment } from "@/lib/environment-safety";

const REMOTE_DATABASE_URL = "postgresql://user:password@database.example.com:5432/cine";
const PRODUCTION_DATABASE_URL = "postgresql://user:password@production-db.example.com:5432/cine";
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/cine";

describe("environment safety", () => {
  it("defaults local executions to development even during a local production build", () => {
    expect(resolveAppEnvironment({ NODE_ENV: "production" })).toBe("development");
  });

  it("rejects contradictory Vercel and application environments", () => {
    expect(() =>
      resolveAppEnvironment({
        APP_ENV: "preview",
        VERCEL_ENV: "production"
      })
    ).toThrow("no coincide");
  });

  it("allows local development without a database", () => {
    expect(assertDatabaseEnvironmentSafety({ NODE_ENV: "development" }).usesDatabase).toBe(false);
  });

  it("allows a local development database", () => {
    const result = assertDatabaseEnvironmentSafety({
      NODE_ENV: "development",
      DATABASE_URL: LOCAL_DATABASE_URL,
      DATABASE_ENVIRONMENT: "development"
    });

    expect(result.usesDatabase).toBe(true);
    expect(result.databaseEnvironment).toBe("development");
  });

  it("blocks a remote database during development by default", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE_DATABASE_URL,
        DATABASE_ENVIRONMENT: "production"
      })
    ).toThrow("Se ha bloqueado una base remota");
  });

  it("requires two explicit development markers before allowing a remote development database", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE_DATABASE_URL,
        ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT: "true"
      })
    ).toThrow("Se ha bloqueado una base remota");

    expect(
      assertDatabaseEnvironmentSafety({
        NODE_ENV: "development",
        DATABASE_URL: REMOTE_DATABASE_URL,
        DATABASE_ENVIRONMENT: "development",
        ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT: "true"
      }).usesDatabase
    ).toBe(true);
  });

  it("allows preview only with a remote preview database", () => {
    expect(
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "preview",
        DATABASE_URL: REMOTE_DATABASE_URL,
        DATABASE_ENVIRONMENT: "preview",
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      }).appEnvironment
    ).toBe("preview");

    expect(() =>
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "preview",
        DATABASE_URL: REMOTE_DATABASE_URL,
        DATABASE_ENVIRONMENT: "production",
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      })
    ).toThrow("no puede utilizar");
  });

  it("allows production only with a remote production database", () => {
    expect(
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "production",
        DATABASE_URL: PRODUCTION_DATABASE_URL,
        DATABASE_ENVIRONMENT: "production",
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      }).appEnvironment
    ).toBe("production");

    expect(() =>
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "production",
        DATABASE_URL: PRODUCTION_DATABASE_URL,
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      })
    ).toThrow("es obligatorio");
  });

  it("requires preview and production to identify the production database host", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "preview",
        DATABASE_URL: REMOTE_DATABASE_URL,
        DATABASE_ENVIRONMENT: "preview"
      })
    ).toThrow("PRODUCTION_DATABASE_HOST es obligatorio");
  });

  it("prevents preview from using the declared production host", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "preview",
        DATABASE_URL: PRODUCTION_DATABASE_URL,
        DATABASE_ENVIRONMENT: "preview",
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      })
    ).toThrow("Preview no puede utilizar");
  });

  it("requires production to use the declared production host", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "production",
        DATABASE_URL: REMOTE_DATABASE_URL,
        DATABASE_ENVIRONMENT: "production",
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      })
    ).toThrow("no apunta al host de producción");
  });

  it("rejects local databases in deployed environments", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        VERCEL_ENV: "preview",
        DATABASE_URL: LOCAL_DATABASE_URL,
        DATABASE_ENVIRONMENT: "preview",
        PRODUCTION_DATABASE_HOST: "production-db.example.com"
      })
    ).toThrow("no puede utilizar una base de datos local");
  });

  it("rejects malformed database URLs", () => {
    expect(() =>
      assertDatabaseEnvironmentSafety({
        NODE_ENV: "development",
        DATABASE_URL: "not-a-url"
      })
    ).toThrow("no es una URL PostgreSQL válida");
  });
});
