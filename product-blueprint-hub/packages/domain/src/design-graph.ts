import { BaseEntity, EntityId, createId, Owned, TargetPlatform } from "./entities";
import { DesignLayer, ProposalStatus, DesignProposal } from "./design-proposals";

export type NodeType = DesignLayer;

export interface DesignGraphNode {
  readonly id: EntityId;
  readonly proposalId: EntityId;
  readonly type: NodeType;
  readonly label: string;
  readonly status: ProposalStatus;
  readonly position: { x: number; y: number };
  readonly pinned: boolean;
}

export type EdgeType = 'DERIVES_FROM' | 'DEPENDS_ON' | 'CONFLICTS_WITH' | 'VALIDATES' | 'COMPOSES';

export interface DesignGraphEdge {
  readonly id: EntityId;
  readonly sourceNodeId: EntityId;
  readonly targetNodeId: EntityId;
  readonly type: EdgeType;
  readonly weight: number;
  readonly label?: string;
}

export interface DesignGraph extends BaseEntity, Owned {
  readonly nodes: DesignGraphNode[];
  readonly edges: DesignGraphEdge[];
  readonly layoutMode: 'MANUAL' | 'LAYERED' | 'FORCE';
}

export interface DesignBaseline extends BaseEntity, Owned {
  readonly versionLabel: string;
  readonly frozenAt: string;
  readonly frozenBy: string;
  readonly contentHash: string;
  readonly snapshot: {
    proposals: DesignProposal[];
    graph: DesignGraph;
    targetPlatforms: TargetPlatform[];
  };
  readonly validationChecklist: { rule: string; passed: boolean }[];
  readonly status: 'ACTIVE' | 'ARCHIVED';
}

export interface ImpactAnalysis {
  readonly sourceNodeId: EntityId;
  readonly impactedNodes: {
    nodeId: EntityId;
    depth: number;
    impactLevel: 'DIRECT' | 'STRONG' | 'WEAK';
    path: EntityId[];
  }[];
  readonly cycleDetected: boolean;
}

export function createDesignGraph(projectId: EntityId): DesignGraph {
  const now = new Date().toISOString();
  return {
    id: createId(),
    projectId,
    nodes: [],
    edges: [],
    layoutMode: 'LAYERED',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
