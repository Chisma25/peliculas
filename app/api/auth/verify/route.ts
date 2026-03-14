import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "El acceso por magic link ya no esta disponible en esta version."
    },
    { status: 410 }
  );
}
