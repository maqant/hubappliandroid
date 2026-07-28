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
  order?: number;
  stepNumber?: number;
  userAction: string;
  action?: string;
  visibleInformation?: string;
  systemResponse?: string;
  featureIds?: EntityId[];
  screenId?: EntityId;
  screenIds?: EntityId[];
  decision?: string;
  stepOutcome?: string;
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
