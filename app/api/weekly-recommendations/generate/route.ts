import { NextResponse } from "next/server";

import { generateBatch } from "@/lib/store";

export async function POST(request: Request) {
  await generateBatch();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
