import { NextResponse } from "next/server";
import type { ModelRequest, ModelResponse } from "@pbh/model-gateway";

// Simple in-memory rate limiting map (IP -> timestamps)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 50; // Max requests
const RATE_WINDOW = 60000; // per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let timestamps = rateLimitMap.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < RATE_WINDOW);
  if (timestamps.length >= RATE_LIMIT) {
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const request = (await req.json()) as ModelRequest;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API Key not configured on server" }, { status: 500 });
    }

    let modelId = process.env.MODEL_LUNA_ID || "gpt-4o-mini";
    if (request.tier === "SOL") {
      modelId = process.env.MODEL_SOL_ID || "gpt-4o";
    } else if (request.tier === "TERRA") {
      modelId = process.env.MODEL_TERRA_ID || "gpt-4o-mini";
    }

    const messages = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    const start = Date.now();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        max_completion_tokens: request.maxTokens,
        temperature: request.temperature,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI Error:", err);
      return NextResponse.json({ error: "OpenAI API Error" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;
    const durationMs = Date.now() - start;

    const result: ModelResponse = {
      content,
      tokensUsed,
      modelId,
      tier: request.tier,
      provider: "openai",
      durationMs,
      correlationId: request.correlationId,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI Complete Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
