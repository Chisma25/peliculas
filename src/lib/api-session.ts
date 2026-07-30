import { operationalErrorResponse } from "@/lib/operational-errors";
import { getSessionUser } from "@/lib/store";

export async function resolveApiSessionUser(scope: string) {
  try {
    return {
      user: await getSessionUser()
    } as const;
  } catch (error) {
    return {
      response: operationalErrorResponse(error, {
        scope,
        fallbackMessage: "Los datos de sesión no están disponibles temporalmente."
      })
    } as const;
  }
}
