import type { EntityId } from "./entities";
import { type DesignProposal, type JourneyStep, normalizeJourneySteps } from "./design-proposals";

export type FeatureCoverageStatus = 'COVERED' | 'PARTIALLY_COVERED' | 'ORPHAN' | 'EXCLUDED';
export type FeatureCoverageMissingRequirement = 'STEP_INSCRIPTION' | 'SCREEN';

export const EXCLUDED_FEATURE_STATUSES = new Set<string>(['SUPERSEDED', 'REJECTED', 'DEFERRED']);

export interface FeatureCoverageDetail {
  readonly featureId: EntityId;
  readonly featureTitle: string;
  readonly status: FeatureCoverageStatus;
  readonly reason: string;
  readonly journeyIds: EntityId[];
  readonly missing: FeatureCoverageMissingRequirement[];
  readonly recommendation: string;
}

export interface FeatureCoverageReport {
  readonly totalFeatures: number;
  readonly coveredCount: number;
  readonly partiallyCoveredCount: number;
  readonly orphanCount: number;
  readonly excludedCount: number;
  readonly coverageRate: number; // 0 à 100 %
  readonly details: FeatureCoverageDetail[];
}

/**
 * Pure domain function evaluating the explicit coverage of accepted/eligible FEATURE proposals
 * by active JOURNEY steps and matérialised SCREEN proposals.
 */
export function computeFeatureCoverage(proposals: DesignProposal[]): FeatureCoverageReport {
  const proposalMap = new Map<EntityId, DesignProposal>();
  proposals.forEach((p) => proposalMap.set(p.id, p));

  const allFeatures = proposals.filter((p) => p.layer === 'FEATURE');
  const activeJourneys = proposals.filter((p) => p.layer === 'JOURNEY' && !EXCLUDED_FEATURE_STATUSES.has(p.status));
  const activeScreens = proposals.filter((p) => p.layer === 'SCREEN' && !EXCLUDED_FEATURE_STATUSES.has(p.status));
  const activeScreenIds = new Set<EntityId>(activeScreens.map((s) => s.id));

  // Map Feature -> Journeys referencing it in steps or direct parentage
  const stepsByFeatureId = new Map<EntityId, { journeyId: EntityId; step: JourneyStep; hasScreen: boolean }[]>();
  const linkedJourneysByFeatureId = new Map<EntityId, Set<EntityId>>();

  activeJourneys.forEach((j) => {
    const steps: JourneyStep[] = normalizeJourneySteps(j.layerData);

    // Direct parentage
    if (j.parentId && proposalMap.get(j.parentId)?.layer === 'FEATURE') {
      const fid = j.parentId;
      if (!linkedJourneysByFeatureId.has(fid)) linkedJourneysByFeatureId.set(fid, new Set());
      linkedJourneysByFeatureId.get(fid)!.add(j.id);
    }
    (j.parentProposalIds || []).forEach((pid) => {
      if (proposalMap.get(pid)?.layer === 'FEATURE') {
        if (!linkedJourneysByFeatureId.has(pid)) linkedJourneysByFeatureId.set(pid, new Set());
        linkedJourneysByFeatureId.get(pid)!.add(j.id);
      }
    });

    // Step-level references
    steps.forEach((st) => {
      // Check if step references an active screen
      const stepScreenIds = [
        ...(st.screenIds || []),
        ...(st.screenId ? [st.screenId] : [])
      ];
      const hasActiveScreen = stepScreenIds.some((sid) => activeScreenIds.has(sid));

      (st.featureIds || []).forEach((fid) => {
        if (!stepsByFeatureId.has(fid)) stepsByFeatureId.set(fid, []);
        stepsByFeatureId.get(fid)!.push({ journeyId: j.id, step: st, hasScreen: hasActiveScreen });

        if (!linkedJourneysByFeatureId.has(fid)) linkedJourneysByFeatureId.set(fid, new Set());
        linkedJourneysByFeatureId.get(fid)!.add(j.id);
      });
    });
  });

  const details: FeatureCoverageDetail[] = [];

  let coveredCount = 0;
  let partiallyCoveredCount = 0;
  let orphanCount = 0;
  let excludedCount = 0;

  allFeatures.forEach((feat) => {
    // 1. Rule 1: EXCLUDED
    if (EXCLUDED_FEATURE_STATUSES.has(feat.status)) {
      excludedCount++;
      details.push({
        featureId: feat.id,
        featureTitle: feat.title,
        status: 'EXCLUDED',
        reason: `Fonctionnalité avec statut non éligible (${feat.status}). Exclue du dénominateur.`,
        journeyIds: [],
        missing: [],
        recommendation: "Aucune action requise (proposition archivée ou différée)."
      });
      return;
    }

    const featureSteps = stepsByFeatureId.get(feat.id) || [];
    const linkedJourneyIds = Array.from(linkedJourneysByFeatureId.get(feat.id) || []);

    // 2. Rule 2: COVERED (Appears in step AND step/journey has an active screen)
    const fullyCoveredStep = featureSteps.find((s) => s.hasScreen);
    if (fullyCoveredStep) {
      coveredCount++;
      details.push({
        featureId: feat.id,
        featureTitle: feat.title,
        status: 'COVERED',
        reason: `Inscrite dans une étape du parcours (JOURNEY ${fullyCoveredStep.journeyId}) avec un écran matérialisé.`,
        journeyIds: linkedJourneyIds,
        missing: [],
        recommendation: "Fonctionnalité parfaitement couverte dans le parcours utilisateur."
      });
      return;
    }

    // 3. Rule 3: PARTIALLY_COVERED
    if (featureSteps.length > 0) {
      // Present in step but missing screen
      partiallyCoveredCount++;
      details.push({
        featureId: feat.id,
        featureTitle: feat.title,
        status: 'PARTIALLY_COVERED',
        reason: `Inscrite dans des étapes de parcours mais aucun écran actif (SCREEN) n'est associé à ces étapes.`,
        journeyIds: linkedJourneyIds,
        missing: ['SCREEN'],
        recommendation: "Matérialiser un écran (SCREEN) et le lier aux étapes de parcours concernées."
      });
      return;
    }

    if (linkedJourneyIds.length > 0) {
      // Linked to journey (e.g. parentage) but absent from steps
      partiallyCoveredCount++;
      details.push({
        featureId: feat.id,
        featureTitle: feat.title,
        status: 'PARTIALLY_COVERED',
        reason: `Rattachée à un parcours utilisateur (${linkedJourneyIds.length} JOURNEY), mais absente des étapes explicites.`,
        journeyIds: linkedJourneyIds,
        missing: ['STEP_INSCRIPTION'],
        recommendation: "Inscrire cette fonctionnalité dans au moins une étape d'un parcours utilisateur (JOURNEY)."
      });
      return;
    }

    // 4. Rule 4: ORPHAN
    orphanCount++;
    details.push({
      featureId: feat.id,
      featureTitle: feat.title,
      status: 'ORPHAN',
      reason: "Fonctionnalité éligible mais absente de tous les parcours utilisateur (JOURNEY).",
      journeyIds: [],
      missing: ['STEP_INSCRIPTION', 'SCREEN'],
      recommendation: "Créer ou rattacher un parcours utilisateur (JOURNEY) intégrant cette fonctionnalité."
    });
  });

  const totalFeatures = allFeatures.length - excludedCount;
  const coverageRate = totalFeatures === 0 ? 0 : Math.round((coveredCount / totalFeatures) * 100);

  return {
    totalFeatures,
    coveredCount,
    partiallyCoveredCount,
    orphanCount,
    excludedCount,
    coverageRate,
    details,
  };
}
