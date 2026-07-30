import type { EntityId, TaskDefinition, MissionManifest, ProductInterviewBaseline } from "@pbh/domain";
import {
  PRODUCT_INTERVIEW_COMMON_BLUEPRINT_USER,
  PRODUCT_INTERVIEW_REQUIRED_VARIABLES,
  LEGACY_FORBIDDEN_VARIABLES,
} from "@pbh/repositories";

export interface ContextBuilderParams {
  mission: MissionManifest;
  task: TaskDefinition;
  project?: {
    id: EntityId;
    language?: string;
    targetPlatform?: string;
    targetFramework?: string;
    deploymentTarget?: string;
  };
  baseline: ProductInterviewBaseline;
  activeDecisions?: any[];
  confirmedAssertions?: any[];
  exclusions?: any[];
  deferredItems?: any[];
  assumedRisks?: any[];
  remainingAssumptions?: any[];
  resolvedContradictions?: any[];
  openQuestions?: any[];
  acceptanceCriteria?: any[];
  sourceReferences?: any[];
  historicalContext?: any[];
  contributionMode?: "FULL" | "MINIMAL" | "NOT_APPLICABLE";
  agentBoundaries?: {
    owns?: any;
    mayReference?: any;
    mustHandoff?: any;
    mustNotChange?: any;
  };
  upstreamContributions?: any[];
  canonicalInventories?: any[];
  outputSchema?: any;
  promptId?: string;
  promptVersion?: number;
}

export function buildProductInterviewAgentContext(params: ContextBuilderParams): Record<string, string> {
  const { mission, task, baseline } = params;

  if (!baseline || !baseline.id || !baseline.version) {
    throw new Error(`BaselineNotFoundError: La Product Interview Baseline est introuvable ou invalide pour la mission '${mission.id}'.`);
  }

  const snapshot: any = (baseline as any).blueprintSnapshot || (baseline as any).snapshot || {};

  const vars: Record<string, string> = {
    MISSION_ID: mission.id,
    MISSION_NAME: mission.name || "Blueprint Generation",
    PROJECT_ID: params.project?.id || mission.projectId,
    LANGUAGE: params.project?.language || "fr",
    TARGET_PLATFORM: params.project?.targetPlatform || snapshot.targetPlatform || "WEB_NEXTJS",
    TARGET_FRAMEWORK: params.project?.targetFramework || "Next.js 15",
    DEPLOYMENT_TARGET: params.project?.deploymentTarget || "Vercel",
    AUTHORITY_TYPE: "PRODUCT_INTERVIEW_BASELINE",
    BASELINE_ID: baseline.id,
    BASELINE_VERSION: String(baseline.version),

    PRODUCT_INTERVIEW_BASELINE_JSON: JSON.stringify(snapshot, null, 2),
    ACTIVE_DECISIONS_JSON: JSON.stringify(params.activeDecisions || snapshot.activeDecisions || [], null, 2),
    CONFIRMED_ASSERTIONS_JSON: JSON.stringify(params.confirmedAssertions || snapshot.confirmedAssertions || [], null, 2),
    EXCLUSIONS_JSON: JSON.stringify(params.exclusions || snapshot.exclusions || [], null, 2),
    DEFERRED_ITEMS_JSON: JSON.stringify(params.deferredItems || snapshot.deferredItems || [], null, 2),
    ASSUMED_RISKS_JSON: JSON.stringify(params.assumedRisks || snapshot.assumedRisks || [], null, 2),
    REMAINING_ASSUMPTIONS_JSON: JSON.stringify(params.remainingAssumptions || snapshot.remainingAssumptions || [], null, 2),
    RESOLVED_CONTRADICTIONS_JSON: JSON.stringify(params.resolvedContradictions || snapshot.resolvedContradictions || [], null, 2),
    OPEN_QUESTIONS_JSON: JSON.stringify(params.openQuestions || snapshot.openQuestions || [], null, 2),
    ACCEPTANCE_CRITERIA_JSON: JSON.stringify(params.acceptanceCriteria || snapshot.acceptanceCriteria || [], null, 2),
    SOURCE_REFERENCES_JSON: JSON.stringify(params.sourceReferences || snapshot.sourceReferences || [], null, 2),
    HISTORICAL_CONTEXT_JSON: JSON.stringify(params.historicalContext || snapshot.historicalContext || [], null, 2),

    AGENT_ID: task.agentId,
    AGENT_ROLE: task.name,
    PROMPT_ID: params.promptId || `blueprint-${task.agentId.toLowerCase()}`,
    PROMPT_VERSION: String(params.promptVersion || 1),
    CONTRIBUTION_MODE: params.contributionMode || "FULL",

    AGENT_OWNS_JSON: JSON.stringify(params.agentBoundaries?.owns || [task.name], null, 2),
    AGENT_MAY_REFERENCE_JSON: JSON.stringify(params.agentBoundaries?.mayReference || ["PRODUCT_INTERVIEW_BASELINE"], null, 2),
    AGENT_MUST_HANDOFF_JSON: JSON.stringify(params.agentBoundaries?.mustHandoff || [], null, 2),
    AGENT_MUST_NOT_CHANGE_JSON: JSON.stringify(params.agentBoundaries?.mustNotChange || ["REAL_PROBLEM", "MVP_SCOPE", "TARGET_PLATFORM"], null, 2),

    UPSTREAM_CONTRIBUTIONS_JSON: JSON.stringify(params.upstreamContributions || [], null, 2),
    CANONICAL_INVENTORIES_JSON: JSON.stringify(params.canonicalInventories || [], null, 2),
    SPECIALIZED_MISSION_PROMPT: task.description || `Effectuer la mission spécialisée pour l'agent ${task.agentId}.`,
    OUTPUT_SCHEMA_JSON: typeof params.outputSchema === "string" ? params.outputSchema : JSON.stringify(params.outputSchema || { type: "object", properties: {} }, null, 2),
  };

  // Verify all 34 required variables are populated
  for (const varName of PRODUCT_INTERVIEW_REQUIRED_VARIABLES) {
    if (vars[varName] === undefined || vars[varName] === null) {
      throw new Error(`MissingContextVariableError: La variable obligatoire '${varName}' n'a pas pu être résolue pour l'agent '${task.agentId}'.`);
    }
  }

  return vars;
}

export function assembleProductInterviewUserPrompt(contextVars: Record<string, string>): string {
  let prompt = PRODUCT_INTERVIEW_COMMON_BLUEPRINT_USER;

  for (const [key, value] of Object.entries(contextVars)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return prompt;
}

export function validateResolvedPrompt(resolvedPrompt: string, mode: "product_interview" | "legacy"): void {
  // Check for unresolved {{VARIABLE}}
  const unresolvedMatches = resolvedPrompt.match(/{{[A-Z_]+}}/g);
  if (unresolvedMatches && unresolvedMatches.length > 0) {
    const uniqueMatches = Array.from(new Set(unresolvedMatches));
    throw new Error(`UnresolvedVariablesError: Les variables suivantes ne sont pas résolues dans le prompt final : ${uniqueMatches.join(", ")}`);
  }

  if (mode === "product_interview") {
    // Check for forbidden legacy variables from Bloc D
    const forbiddenFound: string[] = [];
    for (const forbiddenVar of LEGACY_FORBIDDEN_VARIABLES) {
      if (resolvedPrompt.includes(forbiddenVar)) {
        forbiddenFound.push(forbiddenVar);
      }
    }
    if (forbiddenFound.length > 0) {
      throw new Error(`ForbiddenVariablesError: Les variables historiques suivantes de l'ancien Workshop sont interdites dans le nouveau flux Product Interview : ${forbiddenFound.join(", ")}`);
    }
  }
}
