import { BaseEntity, EntityId, createId, Owned, TargetPlatform } from "./entities";

export type DesignLayer = 'INTENTION' | 'HYPOTHESIS' | 'CAPABILITY' | 'FEATURE' | 'JOURNEY' | 'SCREEN';

export type ProposalStatus = 'DRAFT' | 'PROPOSED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED' | 'DEFERRED' | 'EDITED' | 'NEEDS_CLARIFICATION' | 'LOCKED';

export interface ProposalScore {
  businessValue: number;   // 1-5
  effort: number;          // 1-5
  confidence: number;      // 0-100
}

export interface DesignRisk {
  id: EntityId;
  label: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  likelihood: 'RARE' | 'POSSIBLE' | 'LIKELY';
  mitigation?: string;
  status: 'OPEN' | 'MITIGATED' | 'ACCEPTED';
}

export interface FeatureAlternative {
  id: EntityId;
  proposalId: EntityId;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedComplexity: 'S' | 'M' | 'L' | 'XL';
  platformFit: Partial<Record<TargetPlatform, 'NATIVE' | 'ADAPTED' | 'DEGRADED' | 'INCOMPATIBLE'>>;
  isRecommended: boolean;
  status: 'CANDIDATE' | 'SELECTED' | 'DISCARDED';
}

export type LinkSource = 'AI' | 'AUTO_MATCHED' | 'MANUAL' | null;

export interface IntentionLayerData {
  problem?: string;
  expectedOutcome?: string;
  beneficiaries?: string[];
  usageContext?: string;
  successSignals?: string[];
}

export interface HypothesisLayerData {
  assumption?: string;
  hypothesisCategory?: 'DESIRABILITY' | 'USABILITY' | 'DATA' | 'FEASIBILITY' | 'VIABILITY' | 'TRUST';
  supportingEvidenceExpected?: string;
  invalidationSignal?: string;
  impactIfFalse?: string;
  validationMethod?: string;
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface CapabilityLayerData {
  responsibility?: string;
  inputs?: string[];
  processing?: string[];
  outputs?: string[];
  constraints?: string[];
  servedIntentIds?: EntityId[];
  relatedHypothesisIds?: EntityId[];
  verificationCriteria?: string[];
}

export interface FeatureLayerData {
  initiator?: 'USER' | 'SYSTEM' | 'HYBRID';
  trigger?: string;
  preconditions?: string[];
  inputs?: string[];
  businessRules?: string[];
  dataRead?: string[];
  dataWritten?: string[];
  result?: string;
  states?: {
    initial?: string;
    loading?: string;
    success?: string;
    empty?: string;
    error?: string;
  };
  exceptions?: string[];
  userControl?: string;
  acceptanceCriteria?: string[];
  servedCapabilityIds?: EntityId[];
}

export interface JourneyStep {
  id?: string;
  order?: number;
  stepNumber?: number;
  title?: string;
  label?: string;
  userAction: string;
  action?: string;
  outcome?: string;
  stepOutcome?: string;
  visibleInformation?: string;
  systemResponse?: string;
  featureIds?: EntityId[];
  screenId?: EntityId;
  screenIds?: EntityId[];
  decision?: string;
}

export function normalizeJourneySteps(layerData: any): JourneyStep[] {
  if (!layerData || typeof layerData !== 'object') return [];
  
  let rawSteps: any[] = [];
  if (Array.isArray(layerData.steps)) {
    rawSteps = layerData.steps;
  } else if (Array.isArray(layerData.step)) {
    rawSteps = layerData.step;
  } else if (layerData.step && typeof layerData.step === 'object') {
    rawSteps = [layerData.step];
  } else if (Array.isArray(layerData.actions)) {
    rawSteps = layerData.actions;
  } else if (typeof layerData.actions === 'string') {
    rawSteps = [layerData.actions];
  }

  return rawSteps.map((st, idx) => {
    const order = (st && typeof st === 'object' && (typeof st.order === 'number' ? st.order : (typeof st.stepNumber === 'number' ? st.stepNumber : idx + 1))) || (idx + 1);
    
    let userAction = "";
    if (typeof st === 'string') {
      userAction = st.trim();
    } else if (st && typeof st === 'object') {
      userAction = (st.userAction || st.action || st.title || st.label || '').trim();
    }
    if (!userAction) {
      userAction = `Étape ${order}`;
    }

    const outcome = st && typeof st === 'object' ? (st.outcome || st.stepOutcome || st.expectedOutcome || st.systemResponse || undefined) : undefined;
    
    let featureIds: EntityId[] = [];
    if (st && typeof st === 'object') {
      if (Array.isArray(st.featureIds)) featureIds = st.featureIds.filter(Boolean);
      else if (st.featureId) featureIds = [st.featureId];
    }

    let screenIds: EntityId[] = [];
    if (st && typeof st === 'object') {
      if (Array.isArray(st.screenIds)) screenIds = st.screenIds.filter(Boolean);
      else if (st.screenId) screenIds = [st.screenId];
    }

    return {
      order,
      stepNumber: order,
      userAction,
      action: userAction,
      outcome,
      stepOutcome: outcome,
      featureIds,
      screenIds,
      visibleInformation: st && typeof st === 'object' ? st.visibleInformation : undefined,
      systemResponse: st && typeof st === 'object' ? st.systemResponse : undefined
    };
  });
}

export interface JourneyLayerData {
  actorContext?: string;
  trigger?: string;
  goal?: string;
  preconditions?: string[];
  steps?: JourneyStep[];
  variants?: string[];
  errors?: string[];
  recovery?: string[];
  cancellation?: string[];
  finalOutcome?: string;
  usedFeatureIds?: EntityId[];
}

export interface ScreenLayerData {
  role?: string;
  journeyIds?: EntityId[];
  exposedFeatureIds?: EntityId[];
  entryPoints?: string[];
  exitPoints?: string[];
  displayedInformation?: string[];
  primaryActions?: string[];
  secondaryActions?: string[];
  components?: string[];
  navigationFrom?: string[];
  navigationTo?: string[];
  uiStates?: {
    initial?: string;
    loading?: string;
    empty?: string;
    success?: string;
    error?: string;
  };
  permissions?: string[];
  accessibilityNotes?: string[];
  distinctScreenJustification?: string;
  shared?: boolean;
}

export type LayerSpecificData = 
  | { layer: 'INTENTION'; data: IntentionLayerData }
  | { layer: 'HYPOTHESIS'; data: HypothesisLayerData }
  | { layer: 'CAPABILITY'; data: CapabilityLayerData }
  | { layer: 'FEATURE'; data: FeatureLayerData }
  | { layer: 'JOURNEY'; data: JourneyLayerData }
  | { layer: 'SCREEN'; data: ScreenLayerData };

export interface DesignProposal extends BaseEntity, Owned {
  readonly layer: DesignLayer;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly status: ProposalStatus;
  readonly origin: 'AI_ASSISTED' | 'MANUAL' | 'IMPORTED_FROM_BRIEF';
  readonly alternatives: FeatureAlternative[];
  /** @deprecated Utiliser parentProposalIds comme source de vérité unique pour la parenté */
  readonly parentId?: EntityId | null;
  readonly rootProposalId?: EntityId | null;
  readonly childrenIds?: EntityId[];
  readonly relatedProposalIds?: EntityId[];
  readonly dependencyIds?: EntityId[];
  readonly consequenceIds?: EntityId[];
  readonly shortPitch?: string;
  readonly originPerspective?: string;
  readonly lineage?: string[];
  readonly priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly complexity?: 'S' | 'M' | 'L' | 'XL';
  readonly confidence?: number; // 0-100
  readonly selectedAlternativeId?: EntityId | null;
  readonly risks: DesignRisk[];
  readonly parentProposalIds: EntityId[]; // legacy/multiple parents, keeping for compatibility
  readonly targetPlatforms: TargetPlatform[];
  readonly score?: ProposalScore;
  readonly category: string;
  readonly originAgentId?: string;
  readonly originTaskId?: string;
  readonly userValue?: string;
  readonly sourceExcerpts?: string[];
  readonly decidedAt?: string | null;
  readonly decidedBy?: string | null;
  // Provenance du lien parent (null = orphelin ou couche initiale)
  readonly linkSource?: LinkSource;
  // Score de confiance [0..1] si linkSource === 'AUTO_MATCHED', sinon null
  readonly linkConfidence?: number | null;
  // Données spécialisées par couche
  readonly layerData?: IntentionLayerData | HypothesisLayerData | CapabilityLayerData | FeatureLayerData | JourneyLayerData | ScreenLayerData;
  // Métadonnées de lot de génération
  readonly generationBatchId?: string | null;
  readonly generatedAt?: string | null;
  readonly generationMode?: 'INITIAL' | 'VARIATION' | 'REPLACEMENT' | null;
  readonly variationIndex?: number | null;
  readonly sourceBatchId?: string | null;
  readonly userDiversityFocus?: string | null;
  readonly originOperationId?: string | null;
  // Référence vers l'élément principal en cas de fusion (statut SUPERSEDED)
  readonly mergedIntoId?: EntityId | null;
  readonly mergeReason?: string | null;
}

export interface DuplicateSimilaritySignal {
  readonly type: 'SAME_PARENT' | 'TITLE_PROXIMITY' | 'SAME_STEPS_ACTION' | 'SAME_EXPOSED_FEATURES' | 'ROLE_MATCH';
  readonly label: string;
  readonly description: string;
}

export interface HistoricalDuplicateGroup {
  readonly id: string;
  readonly layer: DesignLayer;
  readonly proposalIds: EntityId[];
  readonly proposals: DesignProposal[];
  readonly primaryCandidateId: EntityId;
  readonly confidence: 'HIGH' | 'MEDIUM';
  readonly similarities: DuplicateSimilaritySignal[];
  readonly differences: string[];
  readonly mergeImpact: {
    readonly childCountToReassign: number;
    readonly dependentCountToReassign: number;
    readonly affectedPathsCount: number;
  };
}

export interface MergeProposalsResult {
  readonly target: DesignProposal;
  readonly mergedSources: DesignProposal[];
  readonly reassignedCount: number;
  readonly updatedProposalsCount: number;
}

export function createDesignProposal(params: Omit<DesignProposal, 'id' | 'version' | 'createdAt' | 'updatedAt'>): DesignProposal {
  const now = new Date().toISOString();
  return {
    ...params,
    id: createId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
