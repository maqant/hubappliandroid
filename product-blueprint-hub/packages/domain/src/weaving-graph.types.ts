import { DesignLayer } from "./design-proposals";

export type WeavingEdgeKind = 'FILIATION' | 'NAVIGATION' | 'RELATED';

export interface WeavingEdge {
  id: string;
  source: string;
  target: string;
  kind: WeavingEdgeKind;
  isOrphanFallback?: boolean;
}

export interface DesignBaselineSummary {
  baselineId: string | null;
  versionLabel: string | null;
  frozenAt: string | null;
  isStale: boolean;
  staleCount: number;
  totals: {
    proposals: number;
    accepted: number;
    rejected: number;
    pending: number;
    deferred: number;
  };
  acceptedByLayer: Record<DesignLayer, number>;
  acceptedByType: Record<string, number>;
  topLevelAccepted: Array<{
    id: string;
    title: string;
    layer: DesignLayer;
    type: string;
    childCount: number;
  }>;
  executiveSummary: string;
}
