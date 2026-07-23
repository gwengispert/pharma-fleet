import { NextResponse } from "next/server";
import { getState } from "@/lib/store";

export async function GET() {
  const body = JSON.stringify(getState(), null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="pharma-fleet-state-${Date.now()}.json"`,
    },
  });
}
