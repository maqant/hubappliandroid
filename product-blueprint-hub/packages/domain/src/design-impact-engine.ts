import { DesignGraph, ImpactAnalysis } from "./design-graph";
import { EntityId } from "./entities";

export interface ImpactEngineOptions {
  cutoffWeight?: number;
}

export class DesignImpactEngine {
  /**
   * Calcule l'impact d'une modification d'un noeud sur le reste du graphe
   */
  static analyze(graph: DesignGraph, sourceNodeId: EntityId, options?: ImpactEngineOptions): ImpactAnalysis {
    const cutoff = options?.cutoffWeight ?? 0.15;
    const impactedNodes: ImpactAnalysis['impactedNodes'] = [];
    const visited = new Set<EntityId>();
    
    let cycleDetected = false;

    // File pour le BFS pondéré: [nodeId, currentWeight, depth, path]
    const queue: Array<[EntityId, number, number, EntityId[]]> = [[sourceNodeId, 1.0, 0, [sourceNodeId]]];

    while (queue.length > 0) {
      const [currentNode, currentWeight, depth, currentPath] = queue.shift()!;
      
      if (visited.has(currentNode)) {
        continue;
      }
      visited.add(currentNode);

      if (currentNode !== sourceNodeId) {
        let impactLevel: 'DIRECT' | 'STRONG' | 'WEAK' = 'WEAK';
        if (depth === 1) impactLevel = 'DIRECT';
        else if (currentWeight > 0.5) impactLevel = 'STRONG';

        impactedNodes.push({
          nodeId: currentNode,
          depth,
          impactLevel,
          path: currentPath,
        });
      }

      // Parcourir les liens sortants
      const outgoingEdges = graph.edges.filter(e => e.sourceNodeId === currentNode);
      
      for (const edge of outgoingEdges) {
        if (currentPath.includes(edge.targetNodeId)) {
          cycleDetected = true;
          continue;
        }

        const newWeight = currentWeight * edge.weight;
        if (newWeight >= cutoff) {
          queue.push([edge.targetNodeId, newWeight, depth + 1, [...currentPath, edge.targetNodeId]]);
        }
      }
    }

    return {
      sourceNodeId,
      impactedNodes,
      cycleDetected,
    };
  }
}
