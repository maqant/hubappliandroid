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

export const STATUS_LABELS_FR: Record<SectionStatus | KnowledgeStatus, string> = {
  EMPTY: "À explorer",
  INFERRED: "Hypothèse",
  TO_CONFIRM: "À confirmer",
  CONFIRMED: "Confirmé",
  CONTRADICTORY: "Contradiction",
  DEFERRED: "Reporté",
  NOT_APPLICABLE: "Non applicable",
  EXCLUDED: "Exclu",
  UNKNOWN: "Inconnu",
};

export const SOURCE_LABELS_FR: Record<KnowledgeSource, string> = {
  PROJECT_IDEA: "Idée initiale du projet",
  SOURCE: "Source externe",
  BRIEF_ITEM: "Élément du brief",
  USER_RESPONSE: "Réponse pendant l'entretien",
  AI_INFERENCE: "Hypothèse proposée par l'Architecte",
  USER_DECISION: "Décision confirmée",
  ORBITE_REVIEW: "Relecture ORBITE",
};

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

// Map statique pure : OrbiteAxis -> BlueprintSectionId
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

// ─── Categories de Classification de Réponse Utilisateur ─────────
export type AnswerCategory =
  | "SUBSTANTIVE"
  | "UNCERTAIN"
  | "DEFER_REQUEST"
  | "REQUEST_OPTIONS"
  | "OFF_TOPIC"
  | "EMPTY"
  | "AMBIGUOUS"
  | "CONTRADICTORY"
  | "CONFIRMATION"
  | "CORRECTION"
  | "EXCLUSION";

/**
 * Classificateur déterministe synchrone de la réponse utilisateur.
 */
export function classifyAnswer(input?: string): AnswerCategory {
  if (!input || input.trim().length === 0) return "EMPTY";

  const lower = input.trim().toLowerCase();

  // Defer request
  if (lower.includes("plus tard") || lower.includes("à voir") || lower.includes("décider plus tard")) {
    return "DEFER_REQUEST";
  }

  // Request options
  if (lower.includes("propose-moi") || lower.includes("proposer des options") || lower.includes("donne-moi des options")) {
    return "REQUEST_OPTIONS";
  }

  // Uncertainty (pure)
  if (
    (lower.startsWith("je ne sais pas") ||
      lower.startsWith("je sais pas") ||
      lower.startsWith("aucune idée") ||
      lower.startsWith("pas sûr") ||
      lower.startsWith("je ne suis pas sûr")) &&
    lower.length < 40
  ) {
    return "UNCERTAIN";
  }

  // Explicit exclusion
  if (lower.startsWith("non, pas besoin") || lower.startsWith("exclure") || lower.includes("hors du mvp") || lower.includes("hors de question")) {
    return "EXCLUSION";
  }

  // Explicit correction
  if (lower.startsWith("non en fait") || lower.startsWith("correction") || lower.startsWith("plutôt")) {
    return "CORRECTION";
  }

  // Explicit confirmation
  if (lower === "oui" || lower === "tout à fait" || lower === "exactement" || lower === "d'accord" || lower === "je confirme") {
    return "CONFIRMATION";
  }

  // Ambiguous
  if ((lower.startsWith("peut-être") || lower.startsWith("ça dépend")) && lower.length < 35) {
    return "AMBIGUOUS";
  }

  return "SUBSTANTIVE";
}

// ─── Conséquences Proposées & Statuts ─────────────────────────────
export type ConsequenceStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "REJECTED"
  | "CORRECTED"
  | "DEFERRED"
  | "SUPERSEDED";

export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ProposedConsequence extends BaseEntity {
  readonly projectId: EntityId;
  readonly sessionId: EntityId;
  readonly sourceAssertionIds: EntityId[];
  readonly targetSectionId: BlueprintSectionId;
  readonly status: ConsequenceStatus;
  readonly impact: ImpactLevel;
  readonly statement: string;
  readonly rationale: string;
  readonly correctedStatement?: string;
  readonly createdAtTurn: number;
  readonly resolvedAt?: string | null;
  readonly version: number;
}

export const VALID_CONSEQUENCE_TRANSITIONS: Record<ConsequenceStatus, ConsequenceStatus[]> = {
  PROPOSED: ["ACCEPTED", "REJECTED", "CORRECTED", "DEFERRED", "SUPERSEDED"],
  DEFERRED: ["ACCEPTED", "REJECTED", "CORRECTED", "SUPERSEDED"],
  CORRECTED: ["SUPERSEDED"],
  ACCEPTED: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
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
  readonly answerClassification?: { category: AnswerCategory; explanation?: string };
  readonly knowledgeUpdates?: Partial<KnowledgeAssertion>[];
  readonly proposedConsequences?: Partial<ProposedConsequence>[];
  readonly blueprintUpdates?: Partial<BlueprintSection>[];
  readonly contradictions?: Partial<ProductInterviewContradiction>[];
  readonly assumptions?: string[];
  readonly nextState?: SessionStatus;
  readonly readiness: ReadinessEvaluation;
  readonly turnImpact?: TurnImpactSummary;
  readonly questionTarget?: { axis: OrbiteAxis; reason?: string };
}

/**
 * Valide le contrat de réponse IA.
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
    if (assertion.status === "EXCLUDED" || assertion.status === "NOT_APPLICABLE") continue;

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

const PHASE_AXES: Record<MaturityStep, OrbiteAxis[]> = {
  EXPLORATION: ["IDENTITY_AND_USER", "USAGE_MOMENT", "CURRENT_BEHAVIOR", "REAL_PROBLEM"],
  CADRAGE: ["DECISION_TO_SIMPLIFY", "MINIMAL_PROMISE", "VALUE_LOOP_ENTRY", "VALUE_LOOP_ACTION", "VALUE_LOOP_RESULT", "VALUE_LOOP_RETURN"],
  MVP: ["MVP_SCOPE", "EXCLUSIONS", "SUCCESS_SIGNAL", "LEARNING_GOAL", "DATA_NECESSARY", "RULES_VS_AI"],
  TRANSMISSION: ["WEAK_STATES", "TRUST_AND_CONTROL", "CONSTRAINTS", "ACCEPTANCE_CRITERIA", "OPEN_RISKS", "OPEN_DECISIONS"],
  READY: ["ROADMAP", "MONETIZATION"],
};

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

export function computeMaturity(
  assertions: KnowledgeAssertion[],
  _sections: Record<BlueprintSectionId, BlueprintSection>,
  contradictions: ProductInterviewContradiction[]
) {
  const states = evaluateAxes(assertions);
  return computeMaturityFromAxes(states, contradictions);
}

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

// ============================================================
// CHANTIER 5 — Relecture ORBITE, Baseline immuable & Transmission
// ============================================================

export type ReviewStatus = 'PENDING_ARBITRATION' | 'ARBITRATED' | 'FAILED';

export type FindingCategory =
  | 'COHERENCE'
  | 'SCOPE'
  | 'VALUE_LOOP'
  | 'DATA'
  | 'FRICTION'
  | 'WEAK_STATE'
  | 'TRUST'
  | 'ASSUMPTION'
  | 'CONTRADICTION'
  | 'ACCEPTANCE_CRITERIA'
  | 'TRANSMISSION';

export type FindingLevel = 'BLOCKING' | 'IMPORTANT' | 'RECOMMENDATION' | 'INFO';

export type FindingDecision = 'ACCEPTED' | 'DISMISSED' | 'DEFERRED' | 'MAINTAINED';

export interface ReviewFinding {
  readonly id: EntityId;
  readonly category: FindingCategory;
  readonly level: FindingLevel;
  readonly title: string;
  readonly observation: string;
  readonly rationale: string;
  readonly sectionIds: readonly BlueprintSectionId[];
  readonly assertionIds?: readonly EntityId[];
  readonly suggestedResolution: string;
  readonly options?: readonly string[];
  readonly isBlocking: boolean;
  decision?: FindingDecision;
  decidedAt?: string;
  userJustification?: string;
}

export interface OrbiteReviewResult {
  readonly id: EntityId;
  readonly sessionId: EntityId;
  readonly requestedAt: string;
  readonly modelCallId: string;
  status: ReviewStatus;
  readonly reviewSummary: string;
  readonly findings: ReviewFinding[];
  readonly strengths: readonly string[];
  readonly remainingAssumptions: readonly string[];
  readonly recommendedNextAction: 'VALIDATE' | 'ARBITRATE' | 'RESUME_INTERVIEW' | 'RESOLVE_CONTRADICTION';
  readonly failureReason?: string;
}

export interface PreReviewBlocker {
  readonly code: 'PENDING_CONSEQUENCES' | 'OPEN_CONTRADICTIONS' | 'BLOCKING_UNKNOWNS' | 'MISSING_MANDATORY_SECTION';
  readonly detail: string;
  readonly relatedIds: readonly string[];
}

export interface PreReviewReadiness {
  readonly ready: boolean;
  readonly blockers: readonly PreReviewBlocker[];
  readonly sectionMaturities: Readonly<Record<BlueprintSectionId, number>>;
}

export function computePreReviewReadiness(
  session: ProductInterviewSession,
  assertions: KnowledgeAssertion[],
  blueprint: FunctionalBlueprint,
  consequences: ProposedConsequence[],
  contradictions: ProductInterviewContradiction[]
): PreReviewReadiness {
  const blockers: PreReviewBlocker[] = [];

  // 1. Pending critical/proposed consequences
  const pendingCons = consequences.filter((c) => c.status === 'PROPOSED');
  if (pendingCons.length > 0) {
    blockers.push({
      code: 'PENDING_CONSEQUENCES',
      detail: `${pendingCons.length} conséquence(s) en attente d'arbitrage utilisateur.`,
      relatedIds: pendingCons.map((c) => c.id),
    });
  }

  // 2. Open blocking contradictions
  const openCtrs = contradictions.filter((c) => c.status === 'OPEN' && c.isBlocking);
  if (openCtrs.length > 0) {
    blockers.push({
      code: 'OPEN_CONTRADICTIONS',
      detail: `${openCtrs.length} contradiction(s) bloquante(s) non résolue(s).`,
      relatedIds: openCtrs.map((c) => c.id),
    });
  }

  // 3. Mandatory sections completeness check (REAL_PROBLEM, DECISION_TO_SIMPLIFY, MINIMAL_PROMISE, MVP_SCOPE)
  const mandatorySections: BlueprintSectionId[] = [
    'REAL_PROBLEM',
    'DECISION_TO_SIMPLIFY',
    'MINIMAL_PROMISE',
    'MVP_SCOPE',
  ];

  const emptyMandatory = mandatorySections.filter(
    (secId) => !blueprint.sections[secId] || blueprint.sections[secId].status === 'EMPTY'
  );

  if (emptyMandatory.length > 0) {
    blockers.push({
      code: 'MISSING_MANDATORY_SECTION',
      detail: `${emptyMandatory.length} section(s) fondamentale(s) non renseignée(s) (${emptyMandatory.join(', ')}).`,
      relatedIds: emptyMandatory,
    });
  }

  const sectionMaturities: Record<BlueprintSectionId, number> = {} as any;
  for (const secId of ALL_BLUEPRINT_SECTION_IDS) {
    const sec = blueprint.sections[secId];
    sectionMaturities[secId] = sec?.status === 'CONFIRMED' ? 1.0 : sec?.status === 'INFERRED' ? 0.6 : 0.0;
  }

  return {
    ready: blockers.length === 0,
    blockers,
    sectionMaturities,
  };
}

export interface CanonicalFeature {
  readonly id: string; // F001, F002...
  readonly title: string;
  readonly purpose: string;
  readonly sectionId: BlueprintSectionId;
  readonly recipient: string;
  readonly isMvp: boolean;
}

export interface CanonicalScreen {
  readonly id: string; // E001, E002...
  readonly name: string;
  readonly purpose: string;
  readonly featureIds: readonly string[];
  readonly weakStatesHandled: readonly string[];
}

export interface CanonicalJourney {
  readonly id: string; // UJ001, UJ002...
  readonly name: string;
  readonly trigger: string;
  readonly expectedOutcome: string;
  readonly featureIds: readonly string[];
  readonly screenIds: readonly string[];
}

export interface TraceabilityEntry {
  readonly promiseItem: string;
  readonly featureId: string;
  readonly screenId: string;
  readonly journeyId: string;
  readonly status: 'VERIFIED' | 'PARTIAL' | 'MISSING';
}

export interface CanonicalInventories {
  readonly FEATURES: readonly CanonicalFeature[];
  readonly SCREENS: readonly CanonicalScreen[];
  readonly USER_JOURNEYS: readonly CanonicalJourney[];
  readonly TRACEABILITY_MATRIX: readonly TraceabilityEntry[];
}

export function buildCanonicalInventories(
  blueprint: FunctionalBlueprint,
  assertions: KnowledgeAssertion[],
  consequences: ProposedConsequence[]
): CanonicalInventories {
  const confirmedAssertions = assertions.filter((a) => a.status === 'CONFIRMED');
  const acceptedConsequences = consequences.filter((c) => c.status === 'ACCEPTED');

  const FEATURES: CanonicalFeature[] = confirmedAssertions.map((a, idx) => ({
    id: `F${String(idx + 1).padStart(3, '0')}`,
    title: a.statement,
    purpose: a.statement,
    sectionId: a.sectionId || 'MVP_SCOPE',
    recipient: 'Utilisateur final',
    isMvp: true,
  }));

  const SCREENS: CanonicalScreen[] = [
    {
      id: 'E001',
      name: 'Écran Principal / Tableau de Bord',
      purpose: 'Exposer la première valeur minimale du produit',
      featureIds: FEATURES.slice(0, 3).map((f) => f.id),
      weakStatesHandled: ['Premier lancement sans données', 'Erreur de connexion', 'Rechargement'],
    },
  ];

  const USER_JOURNEYS: CanonicalJourney[] = [
    {
      id: 'UJ001',
      name: 'Parcours de Première Valeur',
      trigger: 'Lancement du produit',
      expectedOutcome: 'Résultat ou bénéfice minimal délivré',
      featureIds: FEATURES.map((f) => f.id),
      screenIds: SCREENS.map((s) => s.id),
    },
  ];

  const TRACEABILITY_MATRIX: TraceabilityEntry[] = FEATURES.map((f) => ({
    promiseItem: f.title,
    featureId: f.id,
    screenId: 'E001',
    journeyId: 'UJ001',
    status: 'VERIFIED',
  }));

  return {
    FEATURES,
    SCREENS,
    USER_JOURNEYS,
    TRACEABILITY_MATRIX,
  };
}

export type BaselineStatus = 'VALIDATED' | 'SUPERSEDED';

export interface ProductInterviewBaseline {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly sessionId: EntityId;
  readonly version: number;
  readonly status: BaselineStatus;
  readonly createdAt: string;
  readonly validatedAt: string;
  readonly contentHash: string;
  readonly blueprintSnapshot: FunctionalBlueprint;
  readonly assertionsSnapshot: KnowledgeAssertion[];
  readonly decisionsSnapshot: any[];
  readonly acceptedConsequencesSnapshot: ProposedConsequence[];
  readonly arbitratedFindings: ReviewFinding[];
  readonly canonicalInventories: CanonicalInventories;
  readonly narrativeSummary: string;
}

export const PRODUCT_INTERVIEW_BASELINE_CONTRACT = `
[CONTRAT DE BASELINE PRODUCT INTERVIEW — AUTORITÉ CANONIQUE]
1. La ProductInterviewBaseline fournie est l'AUTORITÉ FONCTIONNELLE PRINCIPALE de cette mission.
2. Interdiction de redéfinir le problème, réécrire la promesse ou élargir silencieusement le MVP.
3. Seul FIX-DIRECTOR consolide les inventaires canoniques : FEATURES, SCREENS, USER_JOURNEYS, TRACEABILITY_MATRIX.
4. Toute contribution spécialisée doit référencer les identifiants canoniques (F001, E001, UJ001...) sans dupliquer le produit.
5. ContentHash de référence : {{CONTENT_HASH}}
` as const;

// ─── Chantier 7 — Service Déterministe d'Autorité Produit ───

export type ProductAuthorityStatus =
  | 'PRODUCT_INTERVIEW_BASELINE'
  | 'PRODUCT_INTERVIEW_WORKING_STATE'
  | 'LEGACY_BRIEF'
  | 'NONE';

export interface ProjectProductAuthority {
  readonly status: ProductAuthorityStatus;
  readonly baselineId: EntityId | null;
  readonly hasHistoricalBrief: boolean;
  readonly historicalDivergenceRisk: boolean;
  readonly reason: string;
}

export interface ProductAuthorityFacts {
  readonly latestValidatedBaselineId: EntityId | null;
  readonly hasActiveWorkingState: boolean;
  readonly hasLockedBriefItems: boolean;
}

/**
 * Fonction PURE et déterministe résolvant l'autorité produit principale d'un projet.
 * Priorité stricte :
 * 1. Product Interview Baseline validée
 * 2. Product Interview session / working state en cours
 * 3. Brief historique (BriefItems)
 * 4. Aucun cadrage (NONE)
 */
export function resolveProjectProductAuthority(
  facts: ProductAuthorityFacts
): ProjectProductAuthority {
  const hasHistoricalBrief = facts.hasLockedBriefItems;

  if (facts.latestValidatedBaselineId !== null) {
    return {
      status: 'PRODUCT_INTERVIEW_BASELINE',
      baselineId: facts.latestValidatedBaselineId,
      hasHistoricalBrief,
      historicalDivergenceRisk: hasHistoricalBrief,
      reason: 'Une Product Interview Baseline validée existe et constitue l\'autorité fonctionnelle principale.',
    };
  }

  if (facts.hasActiveWorkingState) {
    return {
      status: 'PRODUCT_INTERVIEW_WORKING_STATE',
      baselineId: null,
      hasHistoricalBrief,
      historicalDivergenceRisk: false,
      reason: 'Un Entretien Produit est en cours de cadrage.',
    };
  }

  if (hasHistoricalBrief) {
    return {
      status: 'LEGACY_BRIEF',
      baselineId: null,
      hasHistoricalBrief: true,
      historicalDivergenceRisk: false,
      reason: 'Le projet utilise le brief historique (mode de compatibilité).',
    };
  }

  return {
    status: 'NONE',
    baselineId: null,
    hasHistoricalBrief: false,
    historicalDivergenceRisk: false,
    reason: 'Aucun cadrage produit n\'a encore été démarré pour ce projet.',
  };
}

// ─── Chantier 8 — Registre Transversal des Arbitrages ───

export type DecisionRegisterSource =
  | 'decision'
  | 'arbitrage'
  | 'accepted-consequence'
  | 'resolved-contradiction'
  | 'orbite-finding';

export type DecisionRegisterStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'HISTORICAL'
  | 'ASSUMED_RISK';

export interface DecisionRegisterEntry {
  readonly id: EntityId;
  readonly source: DecisionRegisterSource;
  readonly sourceId: EntityId;
  readonly title: string;
  readonly statement: string;
  readonly rationale?: string;
  readonly status: DecisionRegisterStatus;
  readonly arbitrationType: string;
  readonly decidedAt: string;
  readonly provenance: string;
  readonly relatedSectionIds?: readonly BlueprintSectionId[];
}

export function buildDecisionRegisterEntries(input: {
  decisions: readonly any[];
  contradictions: readonly ProductInterviewContradiction[];
  consequences: readonly ProposedConsequence[];
  orbiteFindings?: readonly ReviewFinding[];
  assertions?: readonly KnowledgeAssertion[];
}): readonly DecisionRegisterEntry[] {
  const entries: DecisionRegisterEntry[] = [];

  // 1. Map explicit Decisions
  for (const d of input.decisions) {
    entries.push({
      id: `decision:${d.id}`,
      source: 'decision',
      sourceId: d.id,
      title: d.title || 'Décision utilisateur',
      statement: d.statement || d.title,
      rationale: d.rationale,
      status: d.status === 'ACTIVE' ? 'ACTIVE' : d.status === 'SUPERSEDED' ? 'SUPERSEDED' : 'HISTORICAL',
      arbitrationType: 'DECISION_USER',
      decidedAt: d.createdAt || new Date().toISOString(),
      provenance: d.provenance || 'Décision utilisateur',
      relatedSectionIds: d.relatedSectionIds || [],
    });
  }

  // 2. Map Resolved Contradictions
  for (const ctr of input.contradictions) {
    if (ctr.status === 'RESOLVED') {
      entries.push({
        id: `contradiction:${ctr.id}`,
        source: 'resolved-contradiction',
        sourceId: ctr.id,
        title: `Contradiction résolue : ${ctr.topic}`,
        statement: ctr.resolutionRationale || ctr.topic,
        rationale: `Arbitrage entre assertion A et assertion B sur l'axe ${ctr.axis}`,
        status: 'ACTIVE',
        arbitrationType: 'CONTRADICTION_RESOLVED',
        decidedAt: ctr.updatedAt || ctr.createdAt,
        provenance: 'Entretien Produit',
        relatedSectionIds: [AXIS_TO_SECTION[ctr.axis]],
      });
    }
  }

  // 3. Map Accepted/Rejected Consequences
  for (const cons of input.consequences) {
    if (cons.status === 'ACCEPTED' || cons.status === 'REJECTED' || cons.status === 'DEFERRED') {
      entries.push({
        id: `consequence:${cons.id}`,
        source: 'accepted-consequence',
        sourceId: cons.id,
        title: `Conséquence : ${cons.targetSectionId}`,
        statement: cons.statement,
        rationale: cons.userJustification || cons.impactDescription,
        status: cons.status === 'ACCEPTED' ? 'ACTIVE' : cons.status === 'DEFERRED' ? 'DEFERRED' : 'REJECTED',
        arbitrationType: cons.status === 'ACCEPTED' ? 'CONSEQUENCE_ACCEPTED' : cons.status === 'DEFERRED' ? 'DEFERRAL' : 'CONSEQUENCE_REJECTED',
        decidedAt: cons.updatedAt || cons.createdAt,
        provenance: cons.sourceAssertionId ? 'Inférence Blueprint' : 'Architecte Produit',
        relatedSectionIds: [cons.targetSectionId],
      });
    }
  }

  // 4. Map Arbitrated Orbite Findings
  if (input.orbiteFindings) {
    for (const fnd of input.orbiteFindings) {
      if (fnd.decision) {
        entries.push({
          id: `finding:${fnd.id}`,
          source: 'orbite-finding',
          sourceId: fnd.id,
          title: `Arbitrage ORBITE : ${fnd.title}`,
          statement: fnd.observation,
          rationale: fnd.suggestedResolution,
          status: fnd.decision === 'ACCEPTED' ? 'ACTIVE' : fnd.decision === 'MAINTAINED' ? 'ASSUMED_RISK' : fnd.decision === 'DEFERRED' ? 'DEFERRED' : 'REJECTED',
          arbitrationType: 'REVIEW_FINDING_DECIDED',
          decidedAt: new Date().toISOString(),
          provenance: 'Relecteur ORBITE Silencieux',
          relatedSectionIds: [],
        });
      }
    }
  }

  // 5. Deterministic sorting: decidedAt desc, then id asc
  return entries.sort((a, b) => {
    const timeDiff = new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
}

