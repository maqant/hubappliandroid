import type { KnowledgeAssertion, ThemeFamily, ArcHorizon, ProductArc, ThemeSaturationState } from "@pbh/domain";

export const ALL_THEME_FAMILIES: ThemeFamily[] = [
  "HUMAN_CONTEXT",
  "PAIN_AND_COST",
  "PROMISE_AND_VALUE",
  "VALUE_LOOP",
  "MVP_AND_SCOPE",
  "DATA_AND_TRUST",
  "WEAK_STATES",
  "EVOLUTION",
];

const CRITICAL_THEME_FAMILIES: ThemeFamily[] = [
  "HUMAN_CONTEXT",
  "PAIN_AND_COST",
  "PROMISE_AND_VALUE",
  "MVP_AND_SCOPE",
];

const SATURATION_THRESHOLD = 0.75;

export function computeThemeSaturation(
  assertions: KnowledgeAssertion[],
  _askedQuestionCount: number = 0,
): ThemeSaturationState[] {
  const familyCounts: Record<ThemeFamily, number> = {
    HUMAN_CONTEXT: 0,
    PAIN_AND_COST: 0,
    PROMISE_AND_VALUE: 0,
    VALUE_LOOP: 0,
    MVP_AND_SCOPE: 0,
    DATA_AND_TRUST: 0,
    WEAK_STATES: 0,
    EVOLUTION: 0,
  };

  for (const assertion of assertions) {
    if (assertion.status === "EXCLUDED" || assertion.status === "NOT_APPLICABLE") continue;

    const text = (assertion.statement || "").toLowerCase();

    if (text.includes("utilisateur") || text.includes("contexte") || text.includes("moment") || text.includes("habitude")) {
      familyCounts.HUMAN_CONTEXT++;
    }
    if (text.includes("friction") || text.includes("coût") || text.includes("problème") || text.includes("douleur") || text.includes("difficulté")) {
      familyCounts.PAIN_AND_COST++;
    }
    if (text.includes("promesse") || text.includes("valeur") || text.includes("résultat") || text.includes("bénéfice")) {
      familyCounts.PROMISE_AND_VALUE++;
    }
    if (text.includes("entrée") || text.includes("boucle") || text.includes("traitement") || text.includes("action") || text.includes("retour")) {
      familyCounts.VALUE_LOOP++;
    }
    if (text.includes("mvp") || text.includes("périmètre") || text.includes("limite") || text.includes("exclus")) {
      familyCounts.MVP_AND_SCOPE++;
    }
    if (text.includes("donnée") || text.includes("confiance") || text.includes("rgpd") || text.includes("sécurité")) {
      familyCounts.DATA_AND_TRUST++;
    }
    if (text.includes("erreur") || text.includes("hors-ligne") || text.includes("panne") || text.includes("interruption")) {
      familyCounts.WEAK_STATES++;
    }
    if (text.includes("futur") || text.includes("roadmap") || text.includes("extension") || text.includes("v2")) {
      familyCounts.EVOLUTION++;
    }
  }

  return ALL_THEME_FAMILIES.map((family) => {
    const count = familyCounts[family];
    // Baseline score: 3 assertions per family = 1.0 score
    const score = Math.min(1.0, count / 3);
    return {
      family,
      score,
      assertionCount: count,
      saturated: score >= SATURATION_THRESHOLD,
    };
  });
}

export function computeAdaptiveBudget(
  states: ThemeSaturationState[],
  turnCount: number,
  userRequestedEarlyReview: boolean = false,
): {
  remainingQuestions: number;
  shouldTransitionToReview: boolean;
  recommendedAction: "CONTINUE" | "REVIEW";
} {
  if (userRequestedEarlyReview) {
    return {
      remainingQuestions: 0,
      shouldTransitionToReview: true,
      recommendedAction: "REVIEW",
    };
  }

  const criticalStates = states.filter((s) => CRITICAL_THEME_FAMILIES.includes(s.family));
  const allCriticalSaturated = criticalStates.every((s) => s.saturated);

  if (turnCount >= 15 || allCriticalSaturated) {
    return {
      remainingQuestions: 0,
      shouldTransitionToReview: true,
      recommendedAction: "REVIEW",
    };
  }

  const remainingQuestions = Math.max(0, 15 - turnCount);
  return {
    remainingQuestions,
    shouldTransitionToReview: false,
    recommendedAction: "CONTINUE",
  };
}

const VALID_HORIZONS: ArcHorizon[] = [
  "MVP_CORE",
  "MVP_SUPPORT",
  "NEXT",
  "FUTURE",
  "EXCLUDED",
  "UNKNOWN_HORIZON",
];

export function validateArcs(arcs: ProductArc[]): ProductArc[] {
  if (!Array.isArray(arcs)) return [];

  // Deduplicate by title
  const seenTitles = new Set<string>();
  const validList: ProductArc[] = [];

  for (const arc of arcs) {
    if (!arc || !arc.title) continue;
    const normTitle = arc.title.trim().toLowerCase();
    if (seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);

    const horizon: ArcHorizon = VALID_HORIZONS.includes(arc.horizon)
      ? arc.horizon
      : "UNKNOWN_HORIZON";

    validList.push({
      ...arc,
      horizon,
      status: arc.status || "PROPOSED",
    });
  }

  // Clamp count between 3 and 7 if possible
  if (validList.length > 7) {
    return validList.slice(0, 7);
  }

  return validList;
}
