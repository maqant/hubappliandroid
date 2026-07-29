import { BaseEntity, EntityId } from "./entities";

export type KnowledgeStatus =
  | "CONFIRMED"
  | "INFERRED"
  | "UNKNOWN"
  | "CONTRADICTORY"
  | "DEFERRED"
  | "EXCLUDED"
  | "NOT_APPLICABLE";

export type KnowledgeSource =
  | "PROJECT_IDEA"
  | "SOURCE"
  | "BRIEF_ITEM"
  | "USER_RESPONSE"
  | "AI_INFERENCE"
  | "USER_DECISION"
  | "ORBITE_REVIEW";

export type SessionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "WAITING_FOR_USER"
  | "READY_FOR_REVIEW"
  | "FINALIZED"
  | "PAUSED"
  | "FAILED";

export type MaturityStep =
  | "EXPLORATION"
  | "CADRAGE"
  | "MVP"
  | "TRANSMISSION"
  | "READY";

export type BlueprintSectionId =
  | "ORIGINAL_INTUITION"
  | "REAL_PROBLEM"
  | "DECISION_TO_SIMPLIFY"
  | "MINIMAL_PROMISE"
  | "USAGE_MOMENT"
  | "VALUE_LOOP"
  | "PRIMARY_EXPERIENCE"
  | "MVP_SCOPE"
  | "DATA_MATRIX"
  | "RULES_AND_AI"
  | "WEAK_STATES"
  | "TRUST_AND_CONTROL"
  | "EVOLUTION"
  | "TRANSMISSION";

export const BLUEPRINT_SECTION_TITLES: Record<BlueprintSectionId, string> = {
  ORIGINAL_INTUITION: "1. Intuition Initiale",
  REAL_PROBLEM: "2. Problème Réel & Contexte",
  DECISION_TO_SIMPLIFY: "3. Décision / Opération à Simplifier",
  MINIMAL_PROMISE: "4. Promesse Minimale Observable",
  USAGE_MOMENT: "5. Moment d'Usage & Contexte",
  VALUE_LOOP: "6. Boucle de Valeur Complet",
  PRIMARY_EXPERIENCE: "7. Expérience Principale",
  MVP_SCOPE: "8. Périmètre MVP",
  DATA_MATRIX: "9. Matrice des Données",
  RULES_AND_AI: "10. Règles d'Affaires vs IA",
  WEAK_STATES: "11. Gestion des États Faibles",
  TRUST_AND_CONTROL: "12. Confiance, Contrôle & Réversibilité",
  EVOLUTION: "13. Évolutions Futures Reportées",
  TRANSMISSION: "14. Consignes de Transmission aux Agents",
};

export type SectionStatus =
  | "EMPTY"
  | "INFERRED"
  | "TO_CONFIRM"
  | "CONFIRMED"
  | "CONTRADICTORY"
  | "DEFERRED"
  | "NOT_APPLICABLE";

export type MessageType =
  | "CONVERSATIONAL"
  | "QUESTION"
  | "ANSWER"
  | "REFORMULATION"
  | "PROPOSED_CONSEQUENCE"
  | "SYNTHESIS"
  | "WARNING"
  | "FINALIZATION";

export type QuestionType =
  | "FREE_TEXT"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "YES_NO"
  | "CONFIRM_CORRECT"
  | "NO_QUESTION";

export interface KnowledgeAssertion extends BaseEntity {
  readonly projectId: EntityId;
  readonly sessionId: EntityId;
  readonly sectionId: BlueprintSectionId;
  readonly statement: string;
  readonly status: KnowledgeStatus;
  readonly source: KnowledgeSource;
  readonly confidence?: number; // 0-100
  readonly impactedSectionIds: BlueprintSectionId[];
  readonly version: number;
}

export interface ProductInterviewSession extends BaseEntity {
  readonly projectId: EntityId;
  readonly status: SessionStatus;
  readonly maturityStep: MaturityStep;
  readonly activeQuestionId?: EntityId | null;
  readonly questionCount: number;
  readonly blockingUnknownsCount: number;
  readonly importantUnknownsCount: number;
  readonly openContradictionsCount: number;
  readonly allowFinalize: boolean;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly finalizedAt?: string | null;
  readonly version: number;
}

export interface ProductInterviewMessage extends BaseEntity {
  readonly sessionId: EntityId;
  readonly projectId: EntityId;
  readonly role: "USER" | "ASSISTANT";
  readonly content: string;
  readonly type: MessageType;
  readonly inResponseToQuestionId?: EntityId | null;
  readonly createdAssertionIds: EntityId[];
  readonly modifiedAssertionIds: EntityId[];
  readonly version: number;
}

export interface BlueprintSection {
  readonly id: BlueprintSectionId;
  readonly title: string;
  readonly summary: string;
  readonly status: SectionStatus;
  readonly assertionIds: EntityId[];
  readonly decisionIds: EntityId[];
  readonly unknownIds: EntityId[];
  readonly contradictionIds: EntityId[];
  readonly lastUpdatedAt: string;
  readonly version: number;
}

export interface FunctionalBlueprint extends BaseEntity {
  readonly projectId: EntityId;
  readonly sessionId: EntityId;
  readonly sections: Record<BlueprintSectionId, BlueprintSection>;
  readonly version: number;
}

export interface ProductInterviewContradiction extends BaseEntity {
  readonly sessionId: EntityId;
  readonly projectId: EntityId;
  readonly assertionIds: EntityId[];
  readonly subject: string;
  readonly explanation: string;
  readonly potentialImpact: string;
  readonly isBlocking: boolean;
  readonly status: "OPEN" | "RESOLVED";
  readonly resolutionDecisionId?: EntityId | null;
  readonly version: number;
}

export interface SingleQuestion {
  readonly id: EntityId;
  readonly text: string;
  readonly rationale: string;
  readonly responseType: QuestionType;
  readonly options?: string[];
  readonly targetSubject: string;
  readonly affectedSectionIds: BlueprintSectionId[];
  readonly isBlocking: boolean;
}

export interface ReadinessEvaluation {
  readonly maturityStep: MaturityStep;
  readonly blockingUnknownsCount: number;
  readonly importantUnknownsCount: number;
  readonly blockingContradictionsCount: number;
  readonly canFinalize: boolean;
  readonly justification: string;
}

export interface ProductArchitectResponse {
  readonly assistantMessage: string;
  readonly question?: SingleQuestion | null;
  readonly knowledgeUpdates: Partial<KnowledgeAssertion>[];
  readonly blueprintUpdates: Partial<BlueprintSection>[];
  readonly contradictions: Partial<ProductInterviewContradiction>[];
  readonly assumptions: string[];
  readonly nextState: SessionStatus;
  readonly readiness: ReadinessEvaluation;
}

/**
 * Valide le contrat de réponse IA : garantit notamment l'absence de questions multiples.
 */
export function validateProductArchitectResponse(response: ProductArchitectResponse): {
  valid: boolean;
  reason?: string;
} {
  if (!response.assistantMessage || typeof response.assistantMessage !== "string") {
    return { valid: false, reason: "Le message assistantMessage est obligatoire et doit être une chaîne." };
  }
  if (!response.readiness || !response.readiness.maturityStep) {
    return { valid: false, reason: "L'évaluation de maturité readiness est obligatoire." };
  }
  
  // Contrôle de question unique : si question est présent, il doit correspondre à une SingleQuestion valide
  if (response.question) {
    if (!response.question.id || !response.question.text || !response.question.responseType) {
      return { valid: false, reason: "La question structurée est incomplète." };
    }
  }
  return { valid: true };
}

/**
 * Calcule la maturité et les compteurs d'une session à partir de ses assertions et de son blueprint.
 */
export function computeMaturity(
  assertions: KnowledgeAssertion[],
  sections: Record<BlueprintSectionId, BlueprintSection>,
  contradictions: ProductInterviewContradiction[]
): {
  confirmedCount: number;
  inferredCount: number;
  unknownCount: number;
  blockingUnknownsCount: number;
  openContradictionsCount: number;
  maturityStep: MaturityStep;
  allowFinalize: boolean;
} {
  const confirmedCount = assertions.filter((a) => a.status === "CONFIRMED").length;
  const inferredCount = assertions.filter((a) => a.status === "INFERRED").length;
  const unknownCount = assertions.filter((a) => a.status === "UNKNOWN").length;
  const openContradictionsCount = contradictions.filter((c) => c.status === "OPEN").length;
  const blockingUnknownsCount = assertions.filter((a) => a.status === "UNKNOWN" && a.impactedSectionIds.includes("REAL_PROBLEM")).length;

  let maturityStep: MaturityStep = "EXPLORATION";
  if (confirmedCount >= 8 && openContradictionsCount === 0) {
    maturityStep = "TRANSMISSION";
  } else if (confirmedCount >= 5) {
    maturityStep = "MVP";
  } else if (confirmedCount >= 2) {
    maturityStep = "CADRAGE";
  }

  const allowFinalize = openContradictionsCount === 0 && blockingUnknownsCount === 0 && confirmedCount >= 3;

  return {
    confirmedCount,
    inferredCount,
    unknownCount,
    blockingUnknownsCount,
    openContradictionsCount,
    maturityStep,
    allowFinalize,
  };
}
