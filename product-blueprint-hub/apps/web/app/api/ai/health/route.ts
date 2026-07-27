import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const openaiConfigured = !!apiKey;
  const keyPreview = apiKey ? `sk-...${apiKey.slice(-4)}` : null;
  const provider = process.env.NEXT_PUBLIC_MODEL_PROVIDER === "openai" ? "openai" : "fake";

  return NextResponse.json({
    provider,
    configured: openaiConfigured || provider === "fake",
    openaiConfigured,
    keyPreview,
    models: {
      SOL: process.env.MODEL_SOL_ID || "gpt-4o",
      TERRA: process.env.MODEL_TERRA_ID || "gpt-4o-mini",
      LUNA: process.env.MODEL_LUNA_ID || "gpt-4o-mini",
    },
    checkedAt: new Date().toISOString(),
  });
}
