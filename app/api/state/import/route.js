import { NextResponse } from "next/server";
import { replaceState } from "@/lib/store";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid state file" }, { status: 400 });
  }

  const state = replaceState(body);
  return NextResponse.json(state);
}
