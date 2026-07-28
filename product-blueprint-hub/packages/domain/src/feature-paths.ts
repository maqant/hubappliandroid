import type { EntityId } from "./entities";
import type { DesignProposal, ProposalStatus } from "./design-proposals";

export interface FeaturePathNode {
  readonly proposal: DesignProposal;
  readonly isShared: boolean;
  readonly parentIds: EntityId[];
  readonly childIds: EntityId[];
}

export type PathStatus = 
  | 'INCOMPLETE'
  | 'PROPOSED'
  | 'PARTIALLY_ACCEPTED'
  | 'ACCEPTED'
  | 'NEEDS_REVIEW'
  | 'DEFERRED'
  | 'BLOCKED';

export interface FeaturePath {
  readonly id: string; // ex: path-capabilityProposalId
  readonly capabilityProposal: DesignProposal;
  readonly intentions: DesignProposal[];
  readonly hypotheses: DesignProposal[];
  readonly features: FeaturePathNode[];
  readonly journeys: FeaturePathNode[];
  readonly screens: FeaturePathNode[];
  readonly status: PathStatus;
  readonly warnings: string[];
}

/**
 * Fonction pure qui calcule dynamiquement les Feature Paths à partir du graphe de propositions.
 * Un Feature Path est ancré sur chaque CAPABILITY du projet.
 */
export function computeFeaturePaths(proposals: DesignProposal[]): FeaturePath[] {
  const proposalMap = new Map<EntityId, DesignProposal>();
  proposals.forEach((p) => proposalMap.set(p.id, p));

  // 1. Compter les usages pour détecter les éléments partagés
  const usageCounts = new Map<EntityId, number>();
  proposals.forEach((p) => {
    const parentId = p.parentId;
    if (parentId && proposalMap.has(parentId)) {
      usageCounts.set(parentId, (usageCounts.get(parentId) ?? 0) + 1);
    }
    (p.parentProposalIds || []).forEach((pid) => {
      if (proposalMap.has(pid) && pid !== parentId) {
        usageCounts.set(pid, (usageCounts.get(pid) ?? 0) + 1);
      }
    });
  });

  // 2. Extraire toutes les CAPABILITY (ancres des paths)
  const capabilities = proposals.filter((p) => p.layer === 'CAPABILITY');
  if (capabilities.length === 0) return [];

  // Indexation par couche pour la traversée rapide
  const features = proposals.filter((p) => p.layer === 'FEATURE');
  const journeys = proposals.filter((p) => p.layer === 'JOURNEY');
  const screens = proposals.filter((p) => p.layer === 'SCREEN');
  const intentions = proposals.filter((p) => p.layer === 'INTENTION');
  const hypotheses = proposals.filter((p) => p.layer === 'HYPOTHESIS');

  return capabilities.map((cap) => {
    const warnings: string[] = [];

    // --- A. Remonter aux INTENTION & HYPOTHESIS fondatrices ---
    const parentIntentions: DesignProposal[] = [];
    const parentHypotheses: DesignProposal[] = [];

    const capParents = [
      ...(cap.parentId ? [cap.parentId] : []),
      ...(cap.parentProposalIds || []),
    ];

    capParents.forEach((pid) => {
      const parent = proposalMap.get(pid);
      if (parent) {
        if (parent.layer === 'INTENTION' && !parentIntentions.some((i) => i.id === parent.id)) {
          parentIntentions.push(parent);
        } else if (parent.layer === 'HYPOTHESIS' && !parentHypotheses.some((h) => h.id === parent.id)) {
          parentHypotheses.push(parent);
        }
      }
    });

    // Si aucune intention directe n'a été trouvée, rattacher toutes les intentions acceptées par défaut
    if (parentIntentions.length === 0) {
      parentIntentions.push(...intentions.filter((i) => i.status === 'ACCEPTED' || i.status === 'LOCKED'));
    }

    // --- B. Descendre aux FEATURE rattachées à cette CAPABILITY ---
    const pathFeaturesMap = new Map<EntityId, FeaturePathNode>();
    features.forEach((feat) => {
      const isDirectChild = feat.parentId === cap.id || (feat.parentProposalIds || []).includes(cap.id);
      if (isDirectChild) {
        pathFeaturesMap.set(feat.id, {
          proposal: feat,
          isShared: (usageCounts.get(feat.id) ?? 0) > 1,
          parentIds: feat.parentId ? [feat.parentId] : feat.parentProposalIds || [],
          childIds: feat.childrenIds || [],
        });
      }
    });

    const pathFeatureIds = new Set(pathFeaturesMap.keys());

    // --- C. Descendre aux JOURNEY rattachés aux FEATURE du Path ---
    const pathJourneysMap = new Map<EntityId, FeaturePathNode>();
    journeys.forEach((jrn) => {
      const matchesFeature =
        (jrn.parentId && pathFeatureIds.has(jrn.parentId)) ||
        (jrn.parentProposalIds || []).some((pid) => pathFeatureIds.has(pid));

      if (matchesFeature) {
        pathJourneysMap.set(jrn.id, {
          proposal: jrn,
          isShared: (usageCounts.get(jrn.id) ?? 0) > 1,
          parentIds: jrn.parentId ? [jrn.parentId] : jrn.parentProposalIds || [],
          childIds: jrn.childrenIds || [],
        });
      }
    });

    const pathJourneyIds = new Set(pathJourneysMap.keys());

    // --- D. Descendre aux SCREEN rattachés aux JOURNEY du Path ---
    const pathScreensMap = new Map<EntityId, FeaturePathNode>();
    screens.forEach((scr) => {
      const matchesJourney =
        (scr.parentId && pathJourneyIds.has(scr.parentId)) ||
        (scr.parentProposalIds || []).some((pid) => pathJourneyIds.has(pid));

      if (matchesJourney) {
        pathScreensMap.set(scr.id, {
          proposal: scr,
          isShared: (usageCounts.get(scr.id) ?? 0) > 1,
          parentIds: scr.parentId ? [scr.parentId] : scr.parentProposalIds || [],
          childIds: scr.childrenIds || [],
        });
      }
    });

    const pathFeatures = Array.from(pathFeaturesMap.values());
    const pathJourneys = Array.from(pathJourneysMap.values());
    const pathScreens = Array.from(pathScreensMap.values());

    // --- E. Calcul de l'état général du Path ---
    let status: PathStatus = 'PROPOSED';

    if (pathFeatures.length === 0) {
      status = 'INCOMPLETE';
      warnings.push("Aucune fonctionnalité n'a encore été déclinée pour cette capacité.");
    } else if (pathJourneys.length === 0) {
      status = 'INCOMPLETE';
      warnings.push("Aucun parcours utilisateur n'a encore été généré pour les fonctionnalités de ce path.");
    } else if (pathScreens.length === 0) {
      status = 'INCOMPLETE';
      warnings.push("Aucun écran n'a encore été généré pour ce parcours.");
    } else {
      const allNodes = [
        cap,
        ...pathFeatures.map((n) => n.proposal),
        ...pathJourneys.map((n) => n.proposal),
        ...pathScreens.map((n) => n.proposal),
      ];

      const acceptedCount = allNodes.filter((n) => n.status === 'ACCEPTED' || n.status === 'LOCKED').length;
      const rejectedCount = allNodes.filter((n) => n.status === 'REJECTED').length;
      const deferredCount = allNodes.filter((n) => n.status === 'DEFERRED').length;

      if (rejectedCount > 0 && acceptedCount === 0) {
        status = 'BLOCKED';
      } else if (deferredCount > 0 && acceptedCount === 0) {
        status = 'DEFERRED';
      } else if (acceptedCount === allNodes.length) {
        status = 'ACCEPTED';
      } else if (acceptedCount > 0) {
        status = 'PARTIALLY_ACCEPTED';
      } else {
        status = 'PROPOSED';
      }
    }

    return {
      id: `path-${cap.id}`,
      capabilityProposal: cap,
      intentions: parentIntentions,
      hypotheses: parentHypotheses,
      features: pathFeatures,
      journeys: pathJourneys,
      screens: pathScreens,
      status,
      warnings,
    };
  });
}
