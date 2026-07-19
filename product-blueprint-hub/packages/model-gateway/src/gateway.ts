import type { ModelTier } from "@pbh/domain";

// ============================================
// Model Provider Interface
// ============================================

export interface ModelRequest {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly tier: ModelTier;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly correlationId: string;
}

export interface ModelResponse {
  readonly content: string;
  readonly tokensUsed: number;
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly provider: string;
  readonly durationMs: number;
  readonly correlationId: string;
}

export interface IModelProvider {
  readonly name: string;
  readonly isConfigured: boolean;

  complete(request: ModelRequest): Promise<ModelResponse>;
  checkHealth(): Promise<{ status: "ok" | "error"; message: string }>;
}

// ============================================
// Model Router — selects tier based on task
// ============================================

export type TaskComplexity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function routeToTier(complexity: TaskComplexity): ModelTier {
  switch (complexity) {
    case "LOW":
      return "LUNA";
    case "MEDIUM":
      return "TERRA";
    case "HIGH":
      return "SOL";
    case "CRITICAL":
      return "SOL";
  }
}

// ============================================
// Gateway — unified access to providers
// ============================================

export class ModelGateway {
  private providers: Map<string, IModelProvider> = new Map();
  private activeProvider: string = "fake";

  registerProvider(name: string, provider: IModelProvider): void {
    this.providers.set(name, provider);
  }

  setActiveProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider "${name}" is not registered`);
    }
    this.activeProvider = name;
  }

  getActiveProvider(): IModelProvider {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`No provider registered with name "${this.activeProvider}"`);
    }
    return provider;
  }

  getProviderStatus(): { name: string; configured: boolean }[] {
    return Array.from(this.providers.entries()).map(([name, p]) => ({
      name,
      configured: p.isConfigured,
    }));
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    return this.getActiveProvider().complete(request);
  }

  async checkHealth(): Promise<{ status: "ok" | "error"; message: string }> {
    return this.getActiveProvider().checkHealth();
  }
}
