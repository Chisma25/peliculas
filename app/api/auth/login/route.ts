import { NextResponse } from "next/server";

import { authenticateUser, getSessionCookieName } from "@/lib/store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticateUser(username, password);
  if (!user) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  const response = NextResponse.json({
    message: "Sesion iniciada.",
    userId: user.id
  });

  response.cookies.set(getSessionCookieName(), user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}
