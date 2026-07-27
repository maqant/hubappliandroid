"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  Node, 
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection
} from "reactflow";
import "reactflow/dist/style.css";
import { useServices, type DesignLayer, type DesignProposal, type EntityId } from "@/services";

const LAYERS: { id: DesignLayer; label: string; icon: string }[] = [
  { id: 'INTENTION', label: 'Intention', icon: '🎯' },
  { id: 'HYPOTHESIS', label: 'Hypothèse', icon: '🔬' },
  { id: 'CAPABILITY', label: 'Capacité', icon: '⚙️' },
  { id: 'FEATURE', label: 'Fonctionnalité', icon: '🧩' },
  { id: 'JOURNEY', label: 'Parcours', icon: '🗺️' },
  { id: 'SCREEN', label: 'Écran', icon: '🖥️' },
];

export default function DesignMapPage() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;
  const svc = useServices();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadGraphData = useCallback(async () => {
    setIsLoading(true);
    try {
      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];
      let previousLayerAcceptedNodeIds: string[] = [];

      for (let lIdx = 0; lIdx < LAYERS.length; lIdx++) {
        const layerObj = LAYERS[lIdx]!;
        const layerProposals = await svc.designWorkshop.getProposals(projectId as EntityId, layerObj.id);

        // Column Header Node
        const headerId = `header-${layerObj.id}`;
        generatedNodes.push({
          id: headerId,
          position: { x: lIdx * 320, y: 0 },
          data: { label: `${layerObj.icon} ${layerObj.label} (${layerProposals.length})` },
          style: {
            background: 'var(--color-primary-600, #3b82f6)',
            color: '#fff',
            fontWeight: 'bold',
            borderRadius: '8px',
            padding: '8px 16px',
            border: 'none',
            textAlign: 'center',
            width: 260,
          },
          selectable: false,
        });

        const currentLayerNodeIds: string[] = [];

        layerProposals.forEach((p: DesignProposal, pIdx: number) => {
          const nodeId = p.id;
          currentLayerNodeIds.push(nodeId);

          const isAccepted = p.status === 'ACCEPTED';
          const isRejected = p.status === 'REJECTED';
          const isDeferred = p.status === 'DEFERRED';

          generatedNodes.push({
            id: nodeId,
            position: { x: lIdx * 320, y: 80 + pIdx * 110 },
            data: { 
              label: (
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}>{p.title}</div>
                  <div style={{ fontSize: '11px', opacity: 0.8 }}>{p.category || p.originPerspective}</div>
                  {isAccepted && <span style={{ fontSize: '10px', background: '#22c55e', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>✅ Acceptée</span>}
                  {isRejected && <span style={{ fontSize: '10px', background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>❌ Refusée</span>}
                  {isDeferred && <span style={{ fontSize: '10px', background: '#eab308', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>⏸️ Reportée</span>}
                </div>
              )
            },
            style: {
              background: isAccepted ? '#f0fdf4' : isRejected ? '#fef2f2' : isDeferred ? '#fefce8' : '#ffffff',
              border: `2px solid ${isAccepted ? '#22c55e' : isRejected ? '#ef4444' : isDeferred ? '#eab308' : '#cbd5e1'}`,
              borderRadius: '8px',
              padding: '10px',
              width: 260,
              boxShadow: isAccepted ? '0 4px 6px -1px rgba(34, 197, 94, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
            },
          });

          // Connect edges from previous layer accepted nodes
          if (previousLayerAcceptedNodeIds.length > 0 && isAccepted) {
            previousLayerAcceptedNodeIds.forEach((prevId) => {
              generatedEdges.push({
                id: `edge-${prevId}-${nodeId}`,
                source: prevId,
                target: nodeId,
                animated: true,
                style: { stroke: '#22c55e', strokeWidth: 2 },
              });
            });
          }
        });

        if (currentLayerNodeIds.length > 0) {
          previousLayerAcceptedNodeIds = currentLayerNodeIds.filter(id => {
            const prop = layerProposals.find(p => p.id === id);
            return prop?.status === 'ACCEPTED';
          });
        }
      }

      setNodes(generatedNodes);
      setEdges(generatedEdges);
    } catch (e) {
      console.error("Failed to load graph data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, svc, setNodes, setEdges]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-4 border-b border-border flex justify-between bg-surface items-center">
        <div className="flex gap-4 items-center">
          <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
            &larr; Retour à l&apos;atelier
          </button>
          <h2 className="m-0">Cartographie d&apos;Impact</h2>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={loadGraphData}>
            🔄 Rafraîchir
          </button>
        </div>
      </div>
      <div className="flex-1 relative" style={{ height: 'calc(100vh - 140px)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="loading-spinner" />
            <span className="ml-2">Chargement du graphe d&apos;impact...</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-muted text-lg">Aucune proposition n&apos;a encore été générée dans la Conception Assistée.</p>
            <button className="btn btn-primary" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
              ✨ Aller à l&apos;atelier pour essaimer des idées
            </button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
