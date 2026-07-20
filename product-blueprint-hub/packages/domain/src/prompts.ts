import type { EntityId, Timestamped, Versioned } from "./entities";
import { createId } from "./entities";

export interface PromptTemplate extends Timestamped, Versioned {
  id: EntityId;
  promptId: string;
  agentId: string;
  layer?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchemaId?: string;
  supportedTargets?: string[];
  language: string;
  enabled: boolean;
  changelog?: string;
}

export function createPromptTemplate(params: Omit<PromptTemplate, "id" | "version" | "createdAt" | "updatedAt">): PromptTemplate {
  const now = new Date().toISOString();
  return {
    ...params,
    id: createId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
