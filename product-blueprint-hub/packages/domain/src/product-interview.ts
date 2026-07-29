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

// ─── 30+ Axes ORBITE ──────────────────────────────────────────────
export const ORBITE_AXES = [
  "IDENTITY_AND_USER",
  "USAGE_MOMENT",
  "CURRENT_BEHAVIOR",
  "REAL_PROBLEM",
  "DECISION_TO_SIMPLIFY",
  "MINIMAL_PROMISE",
  "VALUE_LOOP_ENTRY",
  "VALUE_LOOP_CONTEXT",
  "VALUE_LOOP_DECISION",
  "VALUE_LOOP_CONFIDENCE",
  "VALUE_LOOP_ACTION",
  "VALUE_LOOP_FEEDBACK",
  "MVP_SCOPE",
  "EXCLUSIONS",
  "SUCCESS_SIGNAL",
  "LEARNING_GOAL",
  "DATA_NECESSARY",
  "DATA_USEFUL",
  "DATA_SENSITIVE",
  "RULES_VS_AI",
  "WEAK_STATES",
  "TRUST_AND_CONTROL",
  "CONSTRAINTS",
  "ROADMAP",
  "MONETIZATION",
  "ACCEPTANCE_CRITERIA",
  "OPEN_RISKS",
  "OPEN_DECISIONS",
] as const;

export type OrbiteAxis = (typeof ORBITE_AXES)[number];

export type OrbiteAxisStatus = "EMPTY" | "INFERRED" | "CONFIRMED" | "CONFLICTING";

export interface OrbiteAxisState {
  readonly axis: OrbiteAxis;
  readonly status: OrbiteAxisStatus;
  readonly assertionIds: EntityId[];
  readonly lastTouchedTurn: number | null;
}

// Map statique pure : OrbiteAxis -> BlueprintSectionId (dérivation garantie sans désynchronisation)
export const AXIS_TO_SECTION: Record<OrbiteAxis, BlueprintSectionId> = {
  IDENTITY_AND_USER: "USAGE_MOMENT",
  USAGE_MOMENT: "USAGE_MOMENT",
  CURRENT_BEHAVIOR: "REAL_PROBLEM",
  REAL_PROBLEM: "REAL_PROBLEM",
  DECISION_TO_SIMPLIFY: "DECISION_TO_SIMPLIFY",
  MINIMAL_PROMISE: "MINIMAL_PROMISE",
  VALUE_LOOP_ENTRY: "VALUE_LOOP",
  VALUE_LOOP_CONTEXT: "VALUE_LOOP",
  VALUE_LOOP_DECISION: "VALUE_LOOP",
  VALUE_LOOP_CONFIDENCE: "VALUE_LOOP",
  VALUE_LOOP_ACTION: "VALUE_LOOP",
  VALUE_LOOP_FEEDBACK: "VALUE_LOOP",
  MVP_SCOPE: "MVP_SCOPE",
  EXCLUSIONS: "MVP_SCOPE",
  SUCCESS_SIGNAL: "MINIMAL_PROMISE",
  LEARNING_GOAL: "MVP_SCOPE",
  DATA_NECESSARY: "DATA_MATRIX",
  DATA_USEFUL: "DATA_MATRIX",
  DATA_SENSITIVE: "DATA_MATRIX",
  RULES_VS_AI: "RULES_AND_AI",
  WEAK_STATES: "WEAK_STATES",
  TRUST_AND_CONTROL: "TRUST_AND_CONTROL",
  CONSTRAINTS: "REAL_PROBLEM",
  ROADMAP: "EVOLUTION",
  MONETIZATION: "EVOLUTION",
  ACCEPTANCE_CRITERIA: "TRANSMISSION",
  OPEN_RISKS: "TRANSMISSION",
  OPEN_DECISIONS: "TRANSMISSION",
};

export interface QuestionCandidate {
  readonly axis: OrbiteAxis;
  readonly score: number;
  readonly reasons: string[];
}

export interface QuestionTarget {
  readonly axis: OrbiteAxis;
  readonly reason: string;
  readonly maturityPhase: MaturityStep;
  readonly targetSubject: string;
  readonly affectedSectionIds: BlueprintSectionId[];
  readonly candidates: QuestionCandidate[];
}

export interface KnowledgeAssertion extends BaseEntity {
  readonly projectId: EntityId;
  readonly sessionId: EntityId;
  readonly sectionId: BlueprintSectionId;
  readonly axis?: OrbiteAxis;
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
  readonly activeQuestionTarget?: QuestionTarget | null;
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
  readonly targetAxis?: OrbiteAxis;
}

export interface ReadinessEvaluation {
  readonly maturityStep: MaturityStep;
  readonly blockingUnknownsCount: number;
  readonly importantUnknownsCount: number;
  readonly blockingContradictionsCount: number;
  readonly canFinalize: boolean;
  readonly justification: string;
}

export interface TurnImpactSummary {
  readonly summary: string;
  readonly confirmedAssertionsCount: number;
  readonly inferredAssertionsCount: number;
  readonly updatedSectionsCount: number;
}

export interface ProductArchitectResponse {
  readonly assistantMessage: string;
  readonly question?: SingleQuestion | null;
  readonly knowledgeUpdates?: Partial<KnowledgeAssertion>[];
  readonly blueprintUpdates?: Partial<BlueprintSection>[];
  readonly contradictions?: Partial<ProductInterviewContradiction>[];
  readonly assumptions?: string[];
  readonly nextState?: SessionStatus;
  readonly readiness: ReadinessEvaluation;
  readonly turnImpact?: TurnImpactSummary;
  readonly questionTarget?: { axis: OrbiteAxis; reason?: string };
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
  
  if (response.question) {
    if (!response.question.id || !response.question.text || !response.question.responseType) {
      return { valid: false, reason: "La question structurée est incomplète." };
    }
  }
  return { valid: true };
}

/**
 * Évalue l'état de chacun des 28+ axes ORBITE de façon pure et déterministe depuis les assertions.
 */
export function evaluateAxes(assertions: KnowledgeAssertion[]): Record<OrbiteAxis, OrbiteAxisState> {
  const states = Object.fromEntries(
    ORBITE_AXES.map((axis) => [
      axis,
      {
        axis,
        status: "EMPTY" as OrbiteAxisStatus,
        assertionIds: [],
        lastTouchedTurn: null,
      },
    ])
  ) as Record<OrbiteAxis, OrbiteAxisState>;

  for (const assertion of assertions) {
    const targetAxis = assertion.axis || (Object.keys(AXIS_TO_SECTION).find((a) => AXIS_TO_SECTION[a as OrbiteAxis] === assertion.sectionId) as OrbiteAxis) || "REAL_PROBLEM";
    const s = states[targetAxis];
    if (!s) continue;

    const newAssertionIds = [...s.assertionIds, assertion.id];

    if (assertion.status === "CONTRADICTORY") {
      states[targetAxis] = { ...s, status: "CONFLICTING", assertionIds: newAssertionIds };
    } else if (assertion.status === "CONFIRMED" && s.status !== "CONFLICTING") {
      states[targetAxis] = { ...s, status: "CONFIRMED", assertionIds: newAssertionIds };
    } else if (s.status === "EMPTY") {
      states[targetAxis] = { ...s, status: "INFERRED", assertionIds: newAssertionIds };
    }
  }

  return states;
}

/**
 * Axes prioritaires par étape de maturité
 */
const PHASE_AXES: Record<MaturityStep, OrbiteAxis[]> = {
  EXPLORATION: ["IDENTITY_AND_USER", "USAGE_MOMENT", "CURRENT_BEHAVIOR", "REAL_PROBLEM"],
  CADRAGE: ["DECISION_TO_SIMPLIFY", "MINIMAL_PROMISE", "VALUE_LOOP_ENTRY", "VALUE_LOOP_ACTION", "VALUE_LOOP_RESULT", "VALUE_LOOP_RETURN"],
  MVP: ["MVP_SCOPE", "EXCLUSIONS", "SUCCESS_SIGNAL", "LEARNING_GOAL", "DATA_NECESSARY", "RULES_VS_AI"],
  TRANSMISSION: ["WEAK_STATES", "TRUST_AND_CONTROL", "CONSTRAINTS", "ACCEPTANCE_CRITERIA", "OPEN_RISKS", "OPEN_DECISIONS"],
  READY: ["ROADMAP", "MONETIZATION"],
};

/**
 * Calcule la maturité et les compteurs d'une session à partir des assertions et contradictions.
 */
export function computeMaturityFromAxes(
  states: Record<OrbiteAxis, OrbiteAxisState>,
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
  const confirmedCount = Object.values(states).filter((s) => s.status === "CONFIRMED").length;
  const inferredCount = Object.values(states).filter((s) => s.status === "INFERRED").length;
  const unknownCount = Object.values(states).filter((s) => s.status === "EMPTY").length;
  const openContradictionsCount = contradictions.filter((c) => c.status === "OPEN").length;
  const blockingUnknownsCount = Object.values(states).filter(
    (s) => PHASE_AXES.EXPLORATION.includes(s.axis) && s.status === "EMPTY"
  ).length;

  let maturityStep: MaturityStep = "EXPLORATION";
  const ok = (a: OrbiteAxis, minStatus: OrbiteAxisStatus) =>
    minStatus === "CONFIRMED" ? states[a]?.status === "CONFIRMED" : states[a]?.status !== "EMPTY";

  if (ok("IDENTITY_AND_USER", "CONFIRMED") && ok("REAL_PROBLEM", "CONFIRMED")) {
    maturityStep = "CADRAGE";
  }
  if (maturityStep === "CADRAGE" && ok("MINIMAL_PROMISE", "CONFIRMED") && ok("DECISION_TO_SIMPLIFY", "CONFIRMED")) {
    maturityStep = "MVP";
  }
  if (maturityStep === "MVP" && ok("MVP_SCOPE", "CONFIRMED") && ok("SUCCESS_SIGNAL", "CONFIRMED")) {
    maturityStep = "TRANSMISSION";
  }
  if (maturityStep === "TRANSMISSION" && ok("ACCEPTANCE_CRITERIA", "CONFIRMED") && openContradictionsCount === 0) {
    maturityStep = "READY";
  }

  const allowFinalize = openContradictionsCount === 0 && blockingUnknownsCount === 0 && confirmedCount >= 4;

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

/**
 * Rétro-compatibilité : wrapper computeMaturity original
 */
export function computeMaturity(
  assertions: KnowledgeAssertion[],
  _sections: Record<BlueprintSectionId, BlueprintSection>,
  contradictions: ProductInterviewContradiction[]
) {
  const states = evaluateAxes(assertions);
  return computeMaturityFromAxes(states, contradictions);
}

/**
 * Moteur Déterministe ORBITE : sélectionne la cible de question prioritaire (#1).
 */
export function selectNextQuestionTarget(
  states: Record<OrbiteAxis, OrbiteAxisState>,
  lastTargetAxis: OrbiteAxis | null = null,
  contradictions: ProductInterviewContradiction[] = []
): QuestionTarget {
  const maturityResult = computeMaturityFromAxes(states, contradictions);
  const phase = maturityResult.maturityStep;

  const candidates: QuestionCandidate[] = ORBITE_AXES.filter((a) => states[a].status !== "CONFIRMED").map((axis) => {
    const s = states[axis];
    const reasons: string[] = [];
    let score = 0;

    if (s.status === "CONFLICTING") {
      score += 200;
      reasons.push("Contradiction bloquante à résoudre");
    }
    if (PHASE_AXES[phase].includes(axis)) {
      score += 100;
      reasons.push(`Axe critique de la phase actuelle (${phase})`);
    }
    if (s.status === "EMPTY") {
      score += 35;
      reasons.push("Aucune information établie (Inconnue)");
    }
    if (s.status === "INFERRED") {
      score += 15;
      reasons.push("Hypothèse à confirmer");
    }
    if (axis === lastTargetAxis) {
      score -= 40;
      reasons.push("Sujet abordé au tour précédent");
    }

    return { axis, score, reasons };
  }).sort(
    (a, b) => b.score - a.score || ORBITE_AXES.indexOf(a.axis) - ORBITE_AXES.indexOf(b.axis)
  );

  const top = candidates[0] || {
    axis: "REAL_PROBLEM" as OrbiteAxis,
    score: 100,
    reasons: ["Axe fondamental initial"],
  };

  const section = AXIS_TO_SECTION[top.axis] || "REAL_PROBLEM";

  return {
    axis: top.axis,
    reason: top.reasons.join(" • "),
    maturityPhase: phase,
    targetSubject: `Clarification de l'axe ${top.axis}`,
    affectedSectionIds: [section],
    candidates: candidates.slice(0, 3),
  };
}
