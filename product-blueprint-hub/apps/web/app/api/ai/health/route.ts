import { NextResponse } from "next/server";

export async function GET() {
  const isFake = process.env.NEXT_PUBLIC_MODEL_PROVIDER !== "openai";
  const configured = isFake || !!process.env.OPENAI_API_KEY;
  const provider = process.env.NEXT_PUBLIC_MODEL_PROVIDER === "openai" ? "openai" : "fake";

  return NextResponse.json({
    provider,
    configured,
    modelsConfigured: true,
  });
}
