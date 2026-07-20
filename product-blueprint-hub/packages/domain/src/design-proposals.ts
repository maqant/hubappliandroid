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
