import type { EntityId } from "./entities";
import type { DesignProposal, JourneyStep, DesignLayer } from "./design-proposals";

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

export interface StepReference {
  journeyId: EntityId;
  stepNumber: number;
  stepAction: string;
  featureIds: EntityId[];
  screenIds: EntityId[];
}

export interface FeaturePath {
  readonly id: string; // ex: path-journeyProposalId
  readonly title: string;
  readonly userGoal: string;
  readonly entryPoint: string;
  readonly finalOutcome: string;
  readonly primaryJourneyId: EntityId | null;
  readonly variantJourneyIds: EntityId[];
  
  // Lists of EntityIds for fast querying & metrics
  readonly intentionIds: EntityId[];
  readonly hypothesisIds: EntityId[];
  readonly capabilityIds: EntityId[];
  readonly featureIds: EntityId[];
  readonly journeyIds: EntityId[];
  readonly screenIds: EntityId[];
  readonly stepReferences: StepReference[];

  // Node categorization lists
  readonly sharedNodeIds: EntityId[];
  readonly orphanNodeIds: EntityId[];
  readonly reviewRequiredNodeIds: EntityId[];
  readonly blockedNodeIds: EntityId[];
  readonly deferredNodeIds: EntityId[];

  readonly warningIds: string[];
  readonly warnings: string[];
  readonly status: PathStatus;
  readonly completeness: number; // 0 à 100
  readonly canonicalNodeIds: EntityId[];
  readonly relationIds: string[];

  // Rich populated objects for UI rendering & backward compatibility
  readonly capabilityProposal?: DesignProposal;
  readonly primaryJourney?: DesignProposal;
  readonly intentions: DesignProposal[];
  readonly hypotheses: DesignProposal[];
  readonly capabilities?: DesignProposal[];
  readonly features: FeaturePathNode[];
  readonly journeys: FeaturePathNode[];
  readonly screens: FeaturePathNode[];
}

/**
 * Pure domain function calculating Experience Paths from the DesignProposal graph.
 * An Experience Path is anchored primarily around a user JOURNEY (and its underlying features/capabilities/ancestry).
 */
export function computeFeaturePaths(proposals: DesignProposal[]): FeaturePath[] {
  const proposalMap = new Map<EntityId, DesignProposal>();
  proposals.forEach((p) => proposalMap.set(p.id, p));

  // 1. Calculate usage counts to identify shared nodes across the project
  const usagesByNodeId = new Map<EntityId, Set<EntityId>>();
  proposals.forEach((p) => {
    const parentId = p.parentId;
    if (parentId && proposalMap.has(parentId)) {
      if (!usagesByNodeId.has(parentId)) usagesByNodeId.set(parentId, new Set());
      usagesByNodeId.get(parentId)!.add(p.id);
    }
    (p.parentProposalIds || []).forEach((pid) => {
      if (proposalMap.has(pid) && pid !== parentId) {
        if (!usagesByNodeId.has(pid)) usagesByNodeId.set(pid, new Set());
        usagesByNodeId.get(pid)!.add(p.id);
      }
    });
  });

  // Extract layers for traversal
  const journeys = proposals.filter((p) => p.layer === 'JOURNEY' && p.status !== 'REJECTED');
  const capabilities = proposals.filter((p) => p.layer === 'CAPABILITY' && p.status !== 'REJECTED');
  const features = proposals.filter((p) => p.layer === 'FEATURE' && p.status !== 'REJECTED');
  const screens = proposals.filter((p) => p.layer === 'SCREEN' && p.status !== 'REJECTED');
  const intentions = proposals.filter((p) => p.layer === 'INTENTION' && p.status !== 'REJECTED');
  const hypotheses = proposals.filter((p) => p.layer === 'HYPOTHESIS' && p.status !== 'REJECTED');

  // Fallback: If no journeys exist yet, create pseudo-paths for Capabilities to support early design phase
  if (journeys.length === 0) {
    if (capabilities.length === 0) return [];
    return capabilities.map((cap) => {
      const capFeatures = features.filter(f => f.parentId === cap.id || (f.parentProposalIds || []).includes(cap.id));
      const canonicalNodeIds = [cap.id, ...capFeatures.map(f => f.id)];
      return {
        id: `path-cap-${cap.id}`,
        title: cap.title,
        userGoal: cap.description || cap.title,
        entryPoint: "N/A — Capacité initiale",
        finalOutcome: cap.shortPitch || cap.title,
        primaryJourneyId: null,
        variantJourneyIds: [],
        intentionIds: intentions.map(i => i.id),
        hypothesisIds: hypotheses.map(h => h.id),
        capabilityIds: [cap.id],
        featureIds: capFeatures.map(f => f.id),
        journeyIds: [],
        screenIds: [],
        stepReferences: [],
        sharedNodeIds: [],
        orphanNodeIds: capFeatures.filter(f => !f.parentId).map(f => f.id),
        reviewRequiredNodeIds: [],
        blockedNodeIds: [],
        deferredNodeIds: [],
        warningIds: ["Aucun parcours utilisateur (JOURNEY) n'a encore été décliné."],
        warnings: ["Aucun parcours utilisateur (JOURNEY) n'a encore été décliné."],
        status: 'INCOMPLETE',
        completeness: 30,
        canonicalNodeIds,
        relationIds: [],
        capabilityProposal: cap,
        intentions,
        hypotheses,
        capabilities: [cap],
        features: capFeatures.map(f => ({ proposal: f, isShared: false, parentIds: [cap.id], childIds: [] })),
        journeys: [],
        screens: [],
      };
    });
  }

  // Group Journeys into Experience Paths (by journey ID or userGoal)
  const paths: FeaturePath[] = [];

  for (const journey of journeys) {
    const journeyData = journey.layerData as any;
    const userGoal = journeyData?.goal || journey.description || journey.title;
    const entryPoint = journeyData?.trigger || journeyData?.preconditions || "Déclencheur utilisateur";
    const finalOutcome = journeyData?.expectedOutcome || journey.shortPitch || journey.title;
    const steps: JourneyStep[] = Array.isArray(journeyData?.steps) ? journeyData.steps : [];

    // Identify features used by this journey
    const linkedFeatureIds = new Set<EntityId>();
    if (journey.parentId && proposalMap.get(journey.parentId)?.layer === 'FEATURE') {
      linkedFeatureIds.add(journey.parentId);
    }
    (journey.parentProposalIds || []).forEach(pid => {
      if (proposalMap.get(pid)?.layer === 'FEATURE') linkedFeatureIds.add(pid);
    });

    // Also collect features referenced in steps
    steps.forEach(st => {
      (st.featureIds || []).forEach(fid => {
        if (proposalMap.has(fid)) linkedFeatureIds.add(fid);
      });
    });

    const pathFeaturesList = Array.from(linkedFeatureIds).map(id => proposalMap.get(id)!).filter(Boolean);

    // Identify Capabilities parent of these features
    const linkedCapIds = new Set<EntityId>();
    pathFeaturesList.forEach(feat => {
      if (feat.parentId && proposalMap.get(feat.parentId)?.layer === 'CAPABILITY') {
        linkedCapIds.add(feat.parentId);
      }
      (feat.parentProposalIds || []).forEach(pid => {
        if (proposalMap.get(pid)?.layer === 'CAPABILITY') linkedCapIds.add(pid);
      });
    });

    const pathCapsList = Array.from(linkedCapIds).map(id => proposalMap.get(id)!).filter(Boolean);

    // Ancestral Hypotheses and Intentions
    const linkedHypoIds = new Set<EntityId>();
    const linkedIntentIds = new Set<EntityId>();

    pathCapsList.forEach(cap => {
      if (cap.parentId && proposalMap.get(cap.parentId)?.layer === 'HYPOTHESIS') linkedHypoIds.add(cap.parentId);
      if (cap.parentId && proposalMap.get(cap.parentId)?.layer === 'INTENTION') linkedIntentIds.add(cap.parentId);
      (cap.parentProposalIds || []).forEach(pid => {
        const parent = proposalMap.get(pid);
        if (parent?.layer === 'HYPOTHESIS') linkedHypoIds.add(pid);
        if (parent?.layer === 'INTENTION') linkedIntentIds.add(pid);
      });
    });

    // Fallback: if empty, attach all active intentions & hypotheses
    if (linkedIntentIds.size === 0) intentions.forEach(i => linkedIntentIds.add(i.id));
    if (linkedHypoIds.size === 0) hypotheses.forEach(h => linkedHypoIds.add(h.id));

    // Identify Screens associated with this Journey or its steps
    const linkedScreenIds = new Set<EntityId>();
    screens.forEach(scr => {
      const isDirectChild = scr.parentId === journey.id || (scr.parentProposalIds || []).includes(journey.id);
      if (isDirectChild) linkedScreenIds.add(scr.id);
    });

    steps.forEach(st => {
      (st.screenIds || []).forEach(sid => {
        if (proposalMap.has(sid)) linkedScreenIds.add(sid);
      });
      if (st.screenId && proposalMap.has(st.screenId)) {
        linkedScreenIds.add(st.screenId);
      }
    });

    const pathScreensList = Array.from(linkedScreenIds).map(id => proposalMap.get(id)!).filter(Boolean);

    // Build StepReferences
    const stepReferences: StepReference[] = steps.map((st, idx) => ({
      journeyId: journey.id,
      stepNumber: st.stepNumber || (idx + 1),
      stepAction: st.userAction || st.action || `Étape ${idx + 1}`,
      featureIds: (st.featureIds || []).filter(id => proposalMap.has(id)),
      screenIds: (st.screenIds || (st.screenId ? [st.screenId] : [])).filter(id => proposalMap.has(id)),
    }));

    // All canonical node IDs in this path
    const canonicalNodeIds = Array.from(new Set<EntityId>([
      ...linkedIntentIds,
      ...linkedHypoIds,
      ...linkedCapIds,
      ...linkedFeatureIds,
      journey.id,
      ...linkedScreenIds
    ]));

    // Node categorization
    const sharedNodeIds = canonicalNodeIds.filter(id => (usagesByNodeId.get(id)?.size || 0) > 1);
    const orphanNodeIds = canonicalNodeIds.filter(id => {
      const p = proposalMap.get(id);
      return p && p.layer !== 'INTENTION' && !p.parentId && (!p.parentProposalIds || p.parentProposalIds.length === 0);
    });
    const reviewRequiredNodeIds = canonicalNodeIds.filter(id => proposalMap.get(id)?.status === 'PROPOSED');
    const blockedNodeIds = canonicalNodeIds.filter(id => proposalMap.get(id)?.status === 'REJECTED');
    const deferredNodeIds = canonicalNodeIds.filter(id => proposalMap.get(id)?.status === 'DEFERRED');

    // Warnings calculation
    const warnings: string[] = [];
    if (pathFeaturesList.length === 0) warnings.push("Parcours sans fonctionnalité rattachée.");
    if (steps.length === 0) warnings.push("Parcours sans étapes structurées.");
    if (pathScreensList.length === 0) warnings.push("Parcours sans écran matérialisé.");
    if (deferredNodeIds.length > 0) warnings.push(`${deferredNodeIds.length} élément(s) reporté(s) à la roadmap.`);

    // Completeness score
    let score = 0;
    if (linkedIntentIds.size > 0) score += 15;
    if (linkedCapIds.size > 0) score += 20;
    if (pathFeaturesList.length > 0) score += 25;
    if (steps.length > 0) score += 20;
    if (pathScreensList.length > 0) score += 20;
    const completeness = Math.min(100, score);

    // Status evaluation
    let status: PathStatus = 'PROPOSED';
    if (completeness < 60) status = 'INCOMPLETE';
    else if (blockedNodeIds.length > 0) status = 'BLOCKED';
    else if (deferredNodeIds.length > 0 && reviewRequiredNodeIds.length === 0) status = 'DEFERRED';
    else if (canonicalNodeIds.every(id => proposalMap.get(id)?.status === 'ACCEPTED' || proposalMap.get(id)?.status === 'LOCKED')) status = 'ACCEPTED';
    else if (canonicalNodeIds.some(id => proposalMap.get(id)?.status === 'ACCEPTED')) status = 'PARTIALLY_ACCEPTED';
    else status = 'PROPOSED';

    paths.push({
      id: `path-jrn-${journey.id}`,
      title: journey.title,
      userGoal,
      entryPoint,
      finalOutcome,
      primaryJourneyId: journey.id,
      variantJourneyIds: [],
      intentionIds: Array.from(linkedIntentIds),
      hypothesisIds: Array.from(linkedHypoIds),
      capabilityIds: Array.from(linkedCapIds),
      featureIds: Array.from(linkedFeatureIds),
      journeyIds: [journey.id],
      screenIds: Array.from(linkedScreenIds),
      stepReferences,
      sharedNodeIds,
      orphanNodeIds,
      reviewRequiredNodeIds,
      blockedNodeIds,
      deferredNodeIds,
      warningIds: warnings,
      warnings,
      status,
      completeness,
      canonicalNodeIds,
      relationIds: [],
      capabilityProposal: pathCapsList[0] || undefined,
      primaryJourney: journey,
      intentions: Array.from(linkedIntentIds).map(id => proposalMap.get(id)!).filter(Boolean),
      hypotheses: Array.from(linkedHypoIds).map(id => proposalMap.get(id)!).filter(Boolean),
      capabilities: pathCapsList,
      features: pathFeaturesList.map(f => ({ proposal: f, isShared: sharedNodeIds.includes(f.id), parentIds: f.parentProposalIds || [], childIds: [] })),
      journeys: [{ proposal: journey, isShared: sharedNodeIds.includes(journey.id), parentIds: journey.parentProposalIds || [], childIds: [] }],
      screens: pathScreensList.map(s => ({ proposal: s, isShared: sharedNodeIds.includes(s.id), parentIds: s.parentProposalIds || [], childIds: [] })),
    });
  }

  return paths;
}

export interface ProjectedPathNode {
  readonly projectionId: string;
  readonly canonicalNodeId: EntityId;
  readonly pathId: string;
  readonly layer: DesignLayer;
  readonly title: string;
  readonly status: string;
  readonly reviewState: string;
  readonly isVisualReference: boolean;
  readonly isShared: boolean;
  readonly sharedUsageCount: number;
  readonly sharedAcrossPathIds: string[];
  readonly isOrphan: boolean;
  readonly positionRole: 'ROOT' | 'MIDDLE' | 'LEAF' | 'ISOLATED';
}

export function projectFeaturePathsToVisualNodes(paths: FeaturePath[], proposals: DesignProposal[]): ProjectedPathNode[] {
  const proposalMap = new Map<EntityId, DesignProposal>();
  proposals.forEach((p) => proposalMap.set(p.id, p));

  const visualNodes: ProjectedPathNode[] = [];

  // 1. Calculate global shared usage
  const usagesByNodeId = new Map<EntityId, Set<string>>();
  paths.forEach(path => {
    path.canonicalNodeIds.forEach(nodeId => {
      if (!usagesByNodeId.has(nodeId)) usagesByNodeId.set(nodeId, new Set());
      usagesByNodeId.get(nodeId)!.add(path.id);
    });
  });

  paths.forEach(path => {
    path.canonicalNodeIds.forEach(nodeId => {
      const proposal = proposalMap.get(nodeId);
      if (!proposal) return;

      const pathUsages = usagesByNodeId.get(nodeId);
      const sharedAcrossPathIds = pathUsages ? Array.from(pathUsages) : [];
      const sharedUsageCount = sharedAcrossPathIds.length;
      const isShared = sharedUsageCount > 1;

      // Un nœud est visuellement une référence dupliquée s'il est partagé.
      const projectionId = `${path.id}__${nodeId}`;

      let positionRole: 'ROOT' | 'MIDDLE' | 'LEAF' | 'ISOLATED' = 'MIDDLE';
      if (!proposal.parentId && (!proposal.parentProposalIds || proposal.parentProposalIds.length === 0)) {
        positionRole = 'ROOT';
      }
      
      const isOrphan = path.orphanNodeIds.includes(nodeId);

      visualNodes.push({
        projectionId,
        canonicalNodeId: nodeId,
        pathId: path.id,
        layer: proposal.layer,
        title: proposal.title,
        status: proposal.status,
        reviewState: proposal.status,
        isVisualReference: isShared,
        isShared,
        sharedUsageCount,
        sharedAcrossPathIds,
        isOrphan,
        positionRole
      });
    });
  });

  return visualNodes;
}
