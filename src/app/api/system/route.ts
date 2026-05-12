import { NextResponse } from "next/server";
import { dispatchBellAction, getBellSystemSnapshot } from "@/lib/bell-server";

export async function GET() {
  const snapshot = await getBellSystemSnapshot();
  return NextResponse.json(snapshot);
}

export async function POST(request: Request) {
  const action = await request.json();
  const snapshot = await dispatchBellAction(action);
  return NextResponse.json(snapshot);
}
