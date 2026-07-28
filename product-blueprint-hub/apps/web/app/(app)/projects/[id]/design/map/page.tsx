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
  Connection,
  MarkerType
} from "reactflow";
import "reactflow/dist/style.css";
import { useServices, type DesignLayer, type DesignProposal, type EntityId, type WeavingEdge } from "@/services";

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
  const [viewMode, setViewMode] = useState<'weaving' | 'layers'>('weaving');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDeepSwarming, setIsDeepSwarming] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadGraphData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (viewMode === 'weaving') {
        const { nodes: rawNodes, edges: rawEdges } = await svc.designWorkshop.getWeavingGraph(projectId as EntityId);
        
        // Group nodes by layer for smart layout
        const layerPositions: Record<string, { x: number; yIndex: number }> = {
          INTENTION:  { x: 0, yIndex: 0 },
          HYPOTHESIS: { x: 300, yIndex: 0 },
          CAPABILITY: { x: 600, yIndex: 0 },
          FEATURE:    { x: 900, yIndex: 0 },
          JOURNEY:    { x: 1200, yIndex: 0 },
          SCREEN:     { x: 1500, yIndex: 0 },
        };

        const generatedNodes: Node[] = rawNodes.map((n: any) => {
          const lPos = layerPositions[n.layer] || { x: 0, yIndex: 0 };
          const curY = 80 + lPos.yIndex * 130;
          lPos.yIndex += 1;

          const isAccepted = n.status === 'ACCEPTED';
          const isSelected = n.id === selectedNodeId;
          const isOrphan = !n.parentId && n.layer !== 'INTENTION';
          const isShared = (n.parentProposalIds && n.parentProposalIds.length > 1);

          return {
            id: n.id,
            position: { x: lPos.x, y: curY },
            data: {
              label: (
                <div style={{ textAlign: 'left', position: 'relative' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', color: '#1e293b' }}>
                    {n.layer === 'SCREEN' ? '🖥️ ' : n.layer === 'JOURNEY' ? '🗺️ ' : ''}{n.title}
                  </div>
                  <div className="flex justify-between items-center gap-1 flex-wrap">
                    <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                      {n.layer}
                    </span>
                    {isAccepted && (
                      <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        ✅ Validée
                      </span>
                    )}
                    {isShared && (
                      <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px' }} title="Élément mutualisé / partagé entre plusieurs parcours">
                        🔗 Partagé
                      </span>
                    )}
                    {isOrphan && (
                      <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }} title="Proposition non tissée — aucun lien amont détecté">
                        ⚠️ Non tissée
                      </span>
                    )}
                  </div>
                </div>
              )
            },
            style: {
              background: isSelected ? '#eff6ff' : isAccepted ? '#ffffff' : '#f8fafc',
              border: `2px solid ${isSelected ? '#3b82f6' : isOrphan ? '#f59e0b' : isAccepted ? '#22c55e' : '#cbd5e1'}`,
              borderRadius: '10px',
              padding: '12px',
              width: 260,
              boxShadow: isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.3)' : isAccepted ? '0 4px 6px -1px rgba(34, 197, 94, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
            }
          };
        });

        const generatedEdges: Edge[] = rawEdges.map((e: WeavingEdge) => {
          const isNav = e.kind === 'NAVIGATION';
          const isRel = e.kind === 'RELATED';
          const isOrphan = e.isOrphanFallback;
          // Lecture de linkSource transmise dans les métadonnées de l'edge (si disponible)
          const linkSource = (e as any).linkSource as string | null | undefined;
          const linkConfidence = (e as any).linkConfidence as number | null | undefined;

          // Stratégie de style selon linkSource
          let stroke = '#22c55e';        // AI / default : vert plein
          let strokeDasharray: string | undefined = undefined;
          let strokeWidth = 2;
          let edgeLabel: string | undefined = undefined;

          if (linkSource === 'AUTO_MATCHED') {
            stroke = '#f59e0b';          // Ambre = lien inféré par TF-IDF
            strokeDasharray = '6 4';
            edgeLabel = linkConfidence != null ? `~${Math.round(linkConfidence * 100)}%` : undefined;
          } else if (linkSource === 'MANUAL') {
            stroke = '#3b82f6';          // Bleu épais = lien manuel
            strokeWidth = 3.5;
          } else if (isNav) {
            stroke = '#3b82f6';
            strokeWidth = 2.5;
          } else if (isRel) {
            stroke = '#94a3b8';
            strokeDasharray = '5 5';
            strokeWidth = 1.5;
          } else if (isOrphan) {
            stroke = '#f59e0b';
            strokeDasharray = '5 5';
            strokeWidth = 1.5;
          }

          return {
            id: e.id,
            source: e.source,
            target: e.target,
            animated: isNav && !linkSource,
            label: edgeLabel,
            style: { stroke, strokeWidth, strokeDasharray },
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke }
          };
        });

        setNodes(generatedNodes);
        setEdges(generatedEdges);
      } else {
        // Fallback: Vue par Couches
        const generatedNodes: Node[] = [];
        const generatedEdges: Edge[] = [];
        let previousLayerAcceptedNodeIds: string[] = [];

        for (let lIdx = 0; lIdx < LAYERS.length; lIdx++) {
          const layerObj = LAYERS[lIdx]!;
          const layerProposals = await svc.designWorkshop.getProposals(projectId as EntityId, layerObj.id);

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

            generatedNodes.push({
              id: nodeId,
              position: { x: lIdx * 320, y: 80 + pIdx * 110 },
              data: {
                label: (
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '2px' }}>{p.title}</div>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>{p.category || p.originPerspective}</div>
                    {isAccepted && <span style={{ fontSize: '10px', background: '#22c55e', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>✅ Acceptée</span>}
                  </div>
                )
              },
              style: {
                background: isAccepted ? '#f0fdf4' : '#ffffff',
                border: `2px solid ${isAccepted ? '#22c55e' : '#cbd5e1'}`,
                borderRadius: '8px',
                padding: '10px',
                width: 260,
              },
            });

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
      }
    } catch (e) {
      console.error("Failed to load graph data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, viewMode, selectedNodeId, svc, setNodes, setEdges]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  const handleDeepSwarm = async (mode: 'expand' | 'alternatives') => {
    if (!selectedNodeId) return;
    setIsDeepSwarming(true);
    try {
      showToast(`⚡ Lancement de l'essaim d'approfondissement (${mode === 'expand' ? 'Développer' : 'Alternatives'})...`);
      const newProps = await svc.designWorkshop.startDeepIdeationSwarm(projectId as EntityId, selectedNodeId as EntityId, mode);
      showToast(`✨ ${newProps.length} nouvelles propositions déclinées et tissées avec succès !`);
      await loadGraphData();
    } catch (e: any) {
      showToast(`❌ Erreur d'essaim : ${e.message || String(e)}`);
    } finally {
      setIsDeepSwarming(false);
    }
  };

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toast */}
      {toastMessage && (
        <div 
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#1e293b',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
            zIndex: 9999,
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Header Bar */}
      <div className="p-4 border-b border-border flex justify-between bg-surface items-center">
        <div className="flex gap-4 items-center">
          <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
            &larr; Retour à l&apos;atelier
          </button>
          <h2 className="m-0">Cartographie &amp; Tissage d&apos;Application</h2>
        </div>

        {/* View Switcher */}
        <div className="flex gap-2 items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
          <button
            className={`btn btn-sm ${viewMode === 'weaving' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('weaving')}
          >
            🕸️ Vue Tissage &amp; Flux Navigation
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'layers' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('layers')}
          >
            📊 Vue par Couches (Architecture)
          </button>
        </div>

        <div className="flex gap-2">
          {selectedNodeId && (
            <div className="flex gap-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleDeepSwarm('expand')}
                disabled={isDeepSwarming}
              >
                💬 Approfondir cette idée
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleDeepSwarm('alternatives')}
                disabled={isDeepSwarming}
              >
                🔀 Alternatives
              </button>
            </div>
          )}
          <button className="btn btn-secondary" onClick={loadGraphData}>
            🔄 Rafraîchir
          </button>
        </div>
      </div>

      {/* Map Legend Bar */}
      {viewMode === 'weaving' && (
        <div className="px-4 py-2 bg-surface border-b border-border text-xs flex gap-6 text-muted flex-wrap">
          <span><strong>Légende des Liens :</strong></span>
          <span style={{ color: '#22c55e' }}>─── IA (lien affirmé)</span>
          <span style={{ color: '#f59e0b' }}>- - - Auto-match TF-IDF (lien inféré, % = confiance)</span>
          <span style={{ color: '#3b82f6' }}>━━━ Manuel / Navigation</span>
          <span style={{ color: '#94a3b8' }}>- - - Lié / Relatif</span>
          <span style={{ border: '2px solid #f59e0b', padding: '0 4px', borderRadius: '4px', color: '#92400e' }}>⚠️ Nœud non tissé</span>
          <span className="ml-auto">Cliquez sur une carte pour lancer un <strong>Essaim d&apos;approfondissement</strong> ciblé.</span>
        </div>
      )}

      {/* ReactFlow Canvas */}
      <div className="flex-1 relative" style={{ height: 'calc(100vh - 160px)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="loading-spinner" />
            <span className="ml-2">Chargement de la cartographie...</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-muted text-lg">Aucune proposition n&apos;a encore été générée dans la Conception Assistée.</p>
            <button className="btn btn-primary" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
              ✨ Aller à l&apos;atelier pour essaimer des idées
            </button>
          </div>
        ) : viewMode === 'weaving' && edges.length === 0 && nodes.some(n => n.data?.layer !== 'INTENTION') ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <div className="text-4xl mb-2">🧵</div>
            <h3 className="text-lg font-semibold">Ces propositions ont été générées avant l&apos;activation du tissage.</h3>
            <p className="text-muted max-w-lg">Le système ne peut pas afficher de liens car les propositions existantes n&apos;ont pas de parent enregistré. Relancez un essaim pour créer des propositions automatiquement liées.</p>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
                ✨ Aller à l&apos;atelier
              </button>
              <button className="btn btn-secondary" onClick={loadGraphData}>
                🔄 Rafraîchir
              </button>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
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
