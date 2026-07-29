import { mkdir } from "node:fs/promises";

import { request, type FullConfig } from "@playwright/test";

const AUTH_STATE_PATH = "playwright/.auth/preview.json";

export default async function globalSetup(config: FullConfig) {
  const username = process.env.E2E_USERNAME?.trim();
  const password = process.env.E2E_PASSWORD;

  if (!username || !password) {
    return;
  }

  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("E2E_BASE_URL no está configurada para preparar la sesión.");
  }

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const origin = new URL(baseURL).origin;
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      Origin: origin,
      ...(bypassSecret
        ? {
            "x-vercel-protection-bypass": bypassSecret,
            "x-vercel-set-bypass-cookie": "true"
          }
        : {})
    }
  });

  try {
    const response = await context.post("/api/auth/login", {
      multipart: { username, password }
    });

    if (!response.ok()) {
      throw new Error(`No se pudo preparar la sesión E2E: HTTP ${response.status()}.`);
    }

    await mkdir("playwright/.auth", { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
  } finally {
    await context.dispose();
  }
}
