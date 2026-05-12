import { NextResponse } from "next/server";
import { pollPlayer } from "@/lib/bell-server";

export async function POST(request: Request) {
  const payload = await request.json();
  const result = await pollPlayer({
    audioEnabled: payload?.audioEnabled === true,
    label: typeof payload?.label === "string" ? payload.label : undefined,
  });

  return NextResponse.json(result);
}
