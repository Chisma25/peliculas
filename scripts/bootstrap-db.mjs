import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { seedDatabase } from "./lib/database-seed.mjs";
import { prepareDatabaseTarget } from "./lib/database-operations.mjs";

const SNAPSHOT_ID = process.env.APP_SNAPSHOT_ID || "main";
const DATA_DIR = process.env.APP_DATA_DIR?.trim() || join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "runtime-state.json");
const APP_ENV = process.env.APP_ENV?.trim().toLowerCase();
const DATABASE_ENVIRONMENT = process.env.DATABASE_ENVIRONMENT?.trim().toLowerCase();
const CONFIRMED_ENVIRONMENT = process.env.CONFIRM_DATABASE_SEED?.trim().toLowerCase();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Configura la conexion antes de lanzar el bootstrap.");
  process.exit(1);
}

if (!["development", "preview", "production"].includes(DATABASE_ENVIRONMENT)) {
  console.error("DATABASE_ENVIRONMENT debe ser development, preview o production antes de sembrar la base.");
  process.exit(1);
}

if (APP_ENV && APP_ENV !== DATABASE_ENVIRONMENT) {
  console.error(`APP_ENV=${APP_ENV} no coincide con DATABASE_ENVIRONMENT=${DATABASE_ENVIRONMENT}.`);
  process.exit(1);
}

if (CONFIRMED_ENVIRONMENT !== DATABASE_ENVIRONMENT) {
  console.error(
    `Seed bloqueado. Define CONFIRM_DATABASE_SEED=${DATABASE_ENVIRONMENT} para confirmar explícitamente el destino.`
  );
  process.exit(1);
}

if (!existsSync(STATE_FILE)) {
  console.error(`No se encontro ${STATE_FILE}. Arranca la app una vez o revisa el estado local antes de sembrar la base.`);
  process.exit(1);
}

prepareDatabaseTarget({ environment: DATABASE_ENVIRONMENT });
const prisma = new PrismaClient();

try {
  const raw = readFileSync(STATE_FILE, "utf8");
  const data = JSON.parse(raw);
  await seedDatabase(prisma, data, SNAPSHOT_ID);

  console.log(`Snapshot "${SNAPSHOT_ID}" y tablas normalizadas cargadas correctamente en la base de datos.`);
} catch (error) {
  console.error("No se pudo cargar el estado en la base de datos.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
