import { parseArguments } from "./lib/database-operations.mjs";
import { verifyDeploymentPayload } from "./lib/deployment-verification.mjs";

const args = parseArguments();
const baseUrl = typeof args.url === "string" ? args.url : null;
const expectedCommit = typeof args["expected-commit"] === "string" ? args["expected-commit"] : null;
const expectedRef = typeof args["expected-ref"] === "string" ? args["expected-ref"] : null;
const expectedEnvironment =
  typeof args["expected-environment"] === "string" ? args["expected-environment"] : null;

function readNumber(value, fallback, minimum) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

const attempts = Math.floor(readNumber(args.attempts, 1, 1));
const delayMs = readNumber(args["delay-ms"], 10_000, 0);
const timeoutMs = readNumber(args["timeout-ms"], 10_000, 1_000);

if (!baseUrl || !expectedCommit) {
  throw new Error("Indica --url y --expected-commit.");
}

const versionUrl = new URL("/api/version", baseUrl);
let lastErrors = [];

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(versionUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      lastErrors = [`La ruta de versión respondió HTTP ${response.status}.`];
    } else {
      const payload = await response.json();
      lastErrors = verifyDeploymentPayload(payload, {
        commit: expectedCommit,
        ref: expectedRef,
        environment: expectedEnvironment
      });

      if (lastErrors.length === 0) {
        console.log(
          `Despliegue verificado: ${payload.shortCommitSha} · ${payload.commitRef} · ${payload.environment}`
        );
        process.exit(0);
      }
    }
  } catch (error) {
    lastErrors = [error instanceof Error ? error.message : String(error)];
  }

  console.log(`Intento ${attempt}/${attempts}: ${lastErrors.join(" ")}`);
  if (attempt < attempts && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

console.error(`No se pudo verificar ${versionUrl}: ${lastErrors.join(" ")}`);
process.exit(1);
