"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

const LAYER_Y_INDEX: Record<DesignLayer, number> = {
  INTENTION: 0,
  HYPOTHESIS: 1,
  CAPABILITY: 2,
  FEATURE: 3,
  JOURNEY: 4,
  SCREEN: 5,
};

const LAYER_CONFIG: Record<DesignLayer, { label: string; icon: string; bg: string; border: string }> = {
  INTENTION:  { label: 'Intention', icon: '🎯', bg: '#eff6ff', border: '#3b82f6' },
  HYPOTHESIS: { label: 'Hypothèse', icon: '🔬', bg: '#fef3c7', border: '#f59e0b' },
  CAPABILITY: { label: 'Capacité', icon: '⚙️', bg: '#f3e8ff', border: '#a855f7' },
  FEATURE:    { label: 'Fonctionnalité', icon: '🧩', bg: '#ecfdf5', border: '#10b981' },
  JOURNEY:    { label: 'Parcours', icon: '🗺️', bg: '#fff7ed', border: '#f97316' },
  SCREEN:     { label: 'Écran', icon: '🖥️', bg: '#f1f5f9', border: '#64748b' },
};

export default function DesignMapPage() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;
  const svc = useServices();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [allProposals, setAllProposals] = useState<DesignProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDeepSwarming, setIsDeepSwarming] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Unified Filter States
  const [showHypotheses, setShowHypotheses] = useState(true);
  const [showDependencies, setShowDependencies] = useState(false);
  const [showDeferred, setShowDeferred] = useState(false);
  const [isolatedPathCapabilityId, setIsolatedPathCapabilityId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadGraphData = useCallback(async () => {
    setIsLoading(true);
    try {
      const allProps = await svc.repos.designProposals.getByProjectId(projectId as EntityId);
      setAllProposals(allProps);

      const { nodes: rawNodes, edges: rawEdges } = await svc.designWorkshop.getWeavingGraph(projectId as EntityId);
      
      // Calculate Vertical Layout (Top-to-Bottom)
      const layerCounts: Record<DesignLayer, number> = {
        INTENTION: 0, HYPOTHESIS: 0, CAPABILITY: 0, FEATURE: 0, JOURNEY: 0, SCREEN: 0
      };

      // Filter nodes based on user toggles
      const filteredRawNodes = rawNodes.filter((n: any) => {
        if (!showHypotheses && n.layer === 'HYPOTHESIS') return false;
        if (!showDeferred && n.status === 'DEFERRED') return false;
        if (isolatedPathCapabilityId) {
          // If capability is isolated, show node if it's in lineage or descendance
          const belongs = n.id === isolatedPathCapabilityId || 
                          (n.lineage || []).includes(isolatedPathCapabilityId) ||
                          (n.parentProposalIds || []).includes(isolatedPathCapabilityId);
          if (!belongs && n.layer !== 'INTENTION') return false;
        }
        return true;
      });

      const filteredNodeIds = new Set(filteredRawNodes.map((n: any) => n.id));

      const generatedNodes: Node[] = filteredRawNodes.map((n: any) => {
        const layer = n.layer as DesignLayer;
        const layerY = (LAYER_Y_INDEX[layer] ?? 0) * 180;
        const indexInLayer = layerCounts[layer] || 0;
        layerCounts[layer] = indexInLayer + 1;

        const xPos = indexInLayer * 280;

        const isAccepted = n.status === 'ACCEPTED';
        const isSelected = n.id === selectedNodeId;
        const isOrphan = !n.parentId && n.layer !== 'INTENTION';
        const isShared = (n.parentProposalIds && n.parentProposalIds.length > 1);
        const config = LAYER_CONFIG[layer] || LAYER_CONFIG.INTENTION;

        return {
          id: n.id,
          position: { x: xPos, y: layerY },
          data: {
            proposal: n,
            label: (
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', color: '#0f172a' }}>
                  {config.icon} {n.title}
                </div>
                <div className="flex justify-between items-center gap-1 flex-wrap mt-2">
                  <span style={{ fontSize: '10px', background: config.bg, color: '#334155', border: `1px solid ${config.border}`, padding: '1px 6px', borderRadius: '4px' }}>
                    {n.layer}
                  </span>
                  {isAccepted && (
                    <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                      ✅ Validée
                    </span>
                  )}
                  {isShared && (
                    <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px' }} title="Mutualisé entre plusieurs parcours">
                      🔗 Partagé
                    </span>
                  )}
                  {isOrphan && (
                    <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }} title="Non tissée">
                      ⚠️ Orphelin
                    </span>
                  )}
                </div>
              </div>
            )
          },
          style: {
            background: isSelected ? '#eff6ff' : isAccepted ? '#ffffff' : '#f8fafc',
            border: `2px solid ${isSelected ? '#3b82f6' : isOrphan ? '#f59e0b' : isAccepted ? '#22c55e' : config.border}`,
            borderRadius: '10px',
            padding: '12px',
            width: 250,
            boxShadow: isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.3)' : '0 2px 4px rgba(0,0,0,0.05)',
          }
        };
      });

      const generatedEdges: Edge[] = rawEdges
        .filter((e: WeavingEdge) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
        .filter((e: WeavingEdge) => {
          if (!showDependencies && e.kind === 'NAVIGATION') return false;
          return true;
        })
        .map((e: WeavingEdge) => {
          const isNav = e.kind === 'NAVIGATION';
          const isRel = e.kind === 'RELATED';
          const linkSource = (e as any).linkSource as string | null | undefined;
          const linkConfidence = (e as any).linkConfidence as number | null | undefined;

          let stroke = '#22c55e';
          let strokeDasharray: string | undefined = undefined;
          let strokeWidth = 2;
          let edgeLabel: string | undefined = undefined;

          if (linkSource === 'AUTO_MATCHED') {
            stroke = '#f59e0b';
            strokeDasharray = '6 4';
            edgeLabel = linkConfidence != null ? `~${Math.round(linkConfidence * 100)}%` : undefined;
          } else if (isNav) {
            stroke = '#3b82f6';
            strokeWidth = 2;
            strokeDasharray = '4 4';
          } else if (isRel) {
            stroke = '#94a3b8';
            strokeDasharray = '4 4';
            strokeWidth = 1.5;
          }

          return {
            id: e.id,
            source: e.source,
            target: e.target,
            animated: isNav,
            label: edgeLabel,
            style: { stroke, strokeWidth, strokeDasharray },
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke }
          };
        });

      setNodes(generatedNodes);
      setEdges(generatedEdges);
    } catch (e) {
      console.error("Failed to load graph data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedNodeId, showHypotheses, showDependencies, showDeferred, isolatedPathCapabilityId, svc, setNodes, setEdges]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  const selectedProposal = useMemo(() => {
    if (!selectedNodeId) return null;
    return allProposals.find(p => p.id === selectedNodeId) || null;
  }, [selectedNodeId, allProposals]);

  const handleDeepSwarm = async (mode: 'expand' | 'alternatives') => {
    if (!selectedNodeId) return;
    setIsDeepSwarming(true);
    try {
      showToast(`⚡ Lancement de l'essaim (${mode === 'expand' ? 'Approfondir' : 'Alternatives'})...`);
      const res = await svc.designWorkshop.startDeepIdeationSwarm(projectId as EntityId, selectedNodeId as EntityId, mode);
      
      if (res.proposals && res.proposals.length > 0) {
        showToast(`✨ ${res.proposals.length} nouvelle(s) proposition(s) générée(s) et intégrée(s) !`);
        await loadGraphData();
      } else if (res.diagnostic) {
        const reasonsStr = res.diagnostic.reasons?.join(" ") || "Aucun résultat produit par l'agent.";
        showToast(`⚠️ Diagnostic : ${reasonsStr}`);
      }
    } catch (e: any) {
      showToast(`❌ Erreur d'essaim : ${e.message || String(e)}`);
    } finally {
      setIsDeepSwarming(false);
    }
  };

  const handleStatusChange = async (status: any) => {
    if (!selectedNodeId) return;
    try {
      await svc.designWorkshop.updateProposalStatus(selectedNodeId as EntityId, status);
      showToast(`Statut mis à jour : ${status}`);
      await loadGraphData();
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`);
    }
  };

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="h-full w-full flex flex-col bg-slate-50">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-lg shadow-2xl z-50 text-sm font-medium border border-slate-700">
          {toastMessage}
        </div>
      )}

      {/* Header Controls Bar */}
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm flex-wrap gap-4">
        <div className="flex gap-4 items-center">
          <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
            &larr; Retour à l&apos;atelier
          </button>
          <h2 className="text-lg font-bold text-slate-800 m-0">
            Cartographie Architecture &amp; Tissage (Top-to-Bottom)
          </h2>
        </div>

        {/* Unified Filter Controls */}
        <div className="flex gap-2 items-center text-xs flex-wrap">
          <button 
            className={`px-3 py-1.5 rounded-md font-medium transition ${showHypotheses ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => setShowHypotheses(!showHypotheses)}
          >
            🔬 Hypothèses {showHypotheses ? '✓' : ''}
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md font-medium transition ${showDependencies ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => setShowDependencies(!showDependencies)}
          >
            🔗 Dépendances Tech {showDependencies ? '✓' : ''}
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md font-medium transition ${showDeferred ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => setShowDeferred(!showDeferred)}
          >
            📌 Reportés (Roadmap) {showDeferred ? '✓' : ''}
          </button>

          {isolatedPathCapabilityId && (
            <button 
              className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md font-medium"
              onClick={() => setIsolatedPathCapabilityId(null)}
            >
              ❌ Revenir à la vue complète
            </button>
          )}

          <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-medium ml-2" onClick={loadGraphData}>
            🔄 Rafraîchir
          </button>
        </div>
      </div>

      {/* Main Canvas & Details Side Panel */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* ReactFlow Workspace */}
        <div className="flex-1 relative" style={{ height: 'calc(100vh - 120px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <span>Chargement de la cartographie...</span>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <p className="text-slate-500 text-lg">Aucune proposition générée dans l&apos;Atelier.</p>
              <button className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
                ✨ Ouvrir l&apos;Atelier de Conception
              </button>
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

        {/* Node Details Sidebar Panel */}
        {selectedProposal && (
          <div className="w-96 bg-white border-l border-slate-200 p-5 overflow-y-auto shadow-xl z-20 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase tracking-wide">
                    {selectedProposal.layer}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 m-0">{selectedProposal.title}</h3>
                </div>
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedNodeId(null)}>
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-sm text-slate-700">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Description</div>
                  <p className="m-0 bg-slate-50 p-2.5 rounded border border-slate-100 leading-relaxed">{selectedProposal.description}</p>
                </div>

                {selectedProposal.rationale && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Justification</div>
                    <p className="m-0 italic text-slate-600">{selectedProposal.rationale}</p>
                  </div>
                )}

                {/* Specialized Layer Data Display */}
                {selectedProposal.layerData && (
                  <div className="border-t border-slate-200 pt-3 mt-3 space-y-2">
                    <div className="text-xs font-bold text-blue-700 uppercase">Détails Spécialisés de la Couche</div>
                    <pre className="text-xs bg-slate-900 text-slate-200 p-3 rounded overflow-x-auto font-mono">
                      {JSON.stringify(selectedProposal.layerData, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-3 flex flex-col gap-1 text-xs text-slate-500">
                  <div>Statut actuel : <strong className="text-slate-800">{selectedProposal.status}</strong></div>
                  <div>Origine : {selectedProposal.originPerspective || 'Système'}</div>
                  {selectedProposal.parentId && <div>Parent direct ID : <code className="text-blue-600">{selectedProposal.parentId}</code></div>}
                </div>
              </div>
            </div>

            {/* Action Bar in Side Panel */}
            <div className="border-t border-slate-200 pt-4 mt-6 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Actions d&apos;Arbitrage &amp; Essaim</div>
              
              <div className="grid grid-cols-2 gap-2">
                <button className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium" onClick={() => handleStatusChange('ACCEPTED')}>
                  ✅ Valider
                </button>
                <button className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium" onClick={() => handleStatusChange('REJECTED')}>
                  ❌ Refuser
                </button>
                <button className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium col-span-2" onClick={() => handleStatusChange('DEFERRED')}>
                  📌 Transférer à la Roadmap (Reporté)
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <button 
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold disabled:opacity-50"
                  onClick={() => handleDeepSwarm('expand')}
                  disabled={isDeepSwarming}
                >
                  💬 Approfondir / Développer cette idée
                </button>
                <button 
                  className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium disabled:opacity-50"
                  onClick={() => handleDeepSwarm('alternatives')}
                  disabled={isDeepSwarming}
                >
                  🔀 Générer des Alternatives
                </button>
                {selectedProposal.layer === 'CAPABILITY' && (
                  <button 
                    className="w-full px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-medium"
                    onClick={() => setIsolatedPathCapabilityId(selectedProposal.id)}
                  >
                    🎯 Isoler la branche de cette Capacité
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
