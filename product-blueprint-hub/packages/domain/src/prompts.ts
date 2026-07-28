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

export const WORKSHOP_PROMPT_VARIABLES = [
  "PROJECT_BRIEF",
  "LAYER_NAME",
  "CONFIRMED_ITEMS_JSON",
  "UPSTREAM_OUTPUTS_JSON",
  "IDEATION_INTENSITY",
  "BRAINSTORMING_MODE",
  "TARGET_PROPOSAL_COUNT",
] as const;
