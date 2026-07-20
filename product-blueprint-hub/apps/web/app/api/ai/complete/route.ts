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
    let diagnostic: Record<string, any> = {
      timestamp: new Date().toISOString(),
      missionId: request.metadata?.missionId,
      taskId: request.metadata?.taskId,
      agentId: request.metadata?.agentId,
      agentName: request.metadata?.agentName,
      modelTier: request.tier,
      modelId: modelId,
      attemptNumber: 1,
      durationMs: 0,
      httpStatus: 0,
      success: false,
      requestId: undefined,
      errorType: undefined,
      errorCode: undefined,
      errorParam: undefined,
      errorMessage: undefined,
      promptLength: request.prompt.length + (request.systemPrompt?.length || 0),
      responseLength: 0,
      inputTokens: 0,
      outputTokens: 0,
    };

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

    diagnostic.durationMs = Date.now() - start;
    diagnostic.httpStatus = response.status;
    diagnostic.requestId = response.headers.get("x-request-id") || undefined;

    if (!response.ok) {
      let errData: any = {};
      try {
        errData = await response.json();
      } catch (e) {
        errData = { error: { message: await response.text() } };
      }
      
      diagnostic.errorType = errData.error?.type;
      diagnostic.errorCode = errData.error?.code;
      diagnostic.errorParam = errData.error?.param;
      diagnostic.errorMessage = errData.error?.message;
      
      console.log(JSON.stringify({ diagnosticOpenAI: diagnostic }));
      
      return NextResponse.json({
        error: "OpenAI API Error",
        diagnostic: {
          upstreamStatus: response.status,
          modelId: modelId,
          agentId: request.metadata?.agentId,
          taskId: request.metadata?.taskId,
          requestId: diagnostic.requestId,
          errorType: diagnostic.errorType,
          errorCode: diagnostic.errorCode,
          message: diagnostic.errorMessage || "Unknown error",
        }
      }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";
    diagnostic.success = true;
    diagnostic.responseLength = content.length;
    diagnostic.inputTokens = data.usage?.prompt_tokens || 0;
    diagnostic.outputTokens = data.usage?.completion_tokens || 0;
    
    console.log(JSON.stringify({ diagnosticOpenAI: diagnostic }));

    const result: ModelResponse = {
      content,
      tokensUsed: data.usage?.total_tokens || 0,
      modelId,
      tier: request.tier,
      provider: "openai",
      durationMs: diagnostic.durationMs,
      correlationId: request.correlationId,
      diagnostic: {
        durationMs: diagnostic.durationMs,
        requestId: diagnostic.requestId,
        modelId,
        upstreamStatus: 200,
      }
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI Complete Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
