export function verifyDeploymentPayload(payload, expected) {
  const errors = [];

  if (!payload || typeof payload !== "object") {
    return ["La respuesta de versión no es un objeto JSON."];
  }

  if (payload.status !== "ok") {
    errors.push(`Estado inesperado: ${String(payload.status)}.`);
  }

  if (payload.service !== "cine-semanal") {
    errors.push(`Servicio inesperado: ${String(payload.service)}.`);
  }

  if (expected.commit && payload.commitSha !== expected.commit) {
    errors.push(`Commit desplegado ${String(payload.commitSha)}; esperado ${expected.commit}.`);
  }

  if (expected.ref && payload.commitRef !== expected.ref) {
    errors.push(`Rama desplegada ${String(payload.commitRef)}; esperada ${expected.ref}.`);
  }

  if (expected.environment && payload.environment !== expected.environment) {
    errors.push(
      `Entorno desplegado ${String(payload.environment)}; esperado ${expected.environment}.`
    );
  }

  return errors;
}
