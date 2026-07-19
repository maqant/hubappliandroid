import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      provider: process.env.MODEL_PROVIDER || "fake",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    },
  });
}
