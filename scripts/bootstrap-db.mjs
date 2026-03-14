import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const SNAPSHOT_ID = process.env.APP_SNAPSHOT_ID || "main";
const STATE_FILE = join(process.cwd(), "data", "runtime-state.json");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Configura la conexion antes de lanzar el bootstrap.");
  process.exit(1);
}

if (!existsSync(STATE_FILE)) {
  console.error(`No se encontro ${STATE_FILE}. Arranca la app una vez o revisa el estado local antes de sembrar la base.`);
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const raw = readFileSync(STATE_FILE, "utf8");
  const data = JSON.parse(raw);

  await prisma.appSnapshot.upsert({
    where: {
      id: SNAPSHOT_ID
    },
    create: {
      id: SNAPSHOT_ID,
      data
    },
    update: {
      data
    }
  });

  console.log(`Snapshot "${SNAPSHOT_ID}" cargado correctamente en la base de datos.`);
} catch (error) {
  console.error("No se pudo cargar el snapshot en la base de datos.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
