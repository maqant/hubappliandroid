"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  MarkerType,
  ReactFlowProvider,
  useReactFlow
} from "reactflow";
import "reactflow/dist/style.css";
import { analysisLogCollector } from "@/lib/export/analysis-log-collector";
import { 
  useServices, 
  type DesignLayer, 
  type DesignProposal, 
  type EntityId, 
  type FeaturePath,
  projectFeaturePathsToVisualNodes
} from "@/services";
import { ExportAnalysisModal } from "@/components/ExportAnalysisModal";
import { exportMapImageOnly } from "@/lib/export/analysis-export";

type ProjectionMode = 'EXPERIENCE_PATHS' | 'STRATEGIC_MAP' | 'GLOBAL_GRAPH';

const LAYER_CONFIG: Record<DesignLayer, { label: string; icon: string; bg: string; border: string }> = {
  INTENTION:  { label: 'Intention', icon: '🎯', bg: '#eff6ff', border: '#3b82f6' },
  HYPOTHESIS: { label: 'Hypothèse', icon: '🔬', bg: '#fef3c7', border: '#f59e0b' },
  CAPABILITY: { label: 'Capacité', icon: '⚙️', bg: '#f3e8ff', border: '#a855f7' },
  FEATURE:    { label: 'Fonctionnalité', icon: '🧩', bg: '#ecfdf5', border: '#10b981' },
  JOURNEY:    { label: 'Parcours', icon: '🗺️', bg: '#fff7ed', border: '#f97316' },
  SCREEN:     { label: 'Écran', icon: '🖥️', bg: '#f1f5f9', border: '#64748b' },
};


function FitViewHelper({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (nodeCount > 0) {
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 800 });
        analysisLogCollector.addEntry({
          timestamp: new Date().toISOString(),
          level: "INFO",
          category: "CARTOGRAPHY",
          message: "CARTOGRAPHY_FITVIEW_EXECUTED",
          context: { fitViewExecuted: true }
        });
      }, 100);
    }
  }, [nodeCount, fitView]);
  return null;
}

function DesignMapPageContent() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;
  const svc = useServices();
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [allProposals, setAllProposals] = useState<DesignProposal[]>([]);
  const [featurePaths, setFeaturePaths] = useState<FeaturePath[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Projection & Selection state
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('EXPERIENCE_PATHS');
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [nodePathContext, setNodePathContext] = useState<any | null>(null);

  // Swarm & Toast
  const [isDeepSwarming, setIsDeepSwarming] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter state
  const [showHypotheses, setShowHypotheses] = useState(true);
  const [showDependencies, setShowDependencies] = useState(false);
  const [showDeferred, setShowDeferred] = useState(false);
  const [showOrphans, setShowOrphans] = useState(true);
  const [isolatedPathId, setIsolatedPathId] = useState<string | null>(null);

  // Export & Canvas Ref
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [project, setProject] = useState<any>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 6000);
  };

  const loadGraphData = useCallback(async () => {
    setIsLoading(true);
    try {
      analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_DATA_LOADED" });
      const p = await svc.repos.projects.getById(projectId as EntityId);
      setProject(p);

      const proposals = await svc.repos.designProposals.getByProjectId(projectId as EntityId);
      setAllProposals(proposals);

      const paths = await svc.designWorkshop.getFeaturePaths(projectId as EntityId);
      setFeaturePaths(paths);
      analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PATHS_COMPUTED", context: { pathCount: paths.length, proposalCount: proposals.length } });
      const { edges: rawEdges } = await svc.designWorkshop.getWeavingGraph(projectId as EntityId);

      const proposalMap = new Map(proposals.map(p => [p.id, p]));

      // Count node usages across paths for visual reference calculations
      const pathUsages = new Map<EntityId, Set<string>>();
      paths.forEach(p => {
        p.canonicalNodeIds.forEach(cid => {
          if (!pathUsages.has(cid)) pathUsages.set(cid, new Set());
          pathUsages.get(cid)!.add(p.id);
        });
      });

      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];

      // ================================================================
      // PROJECTION 1 : EXPERIENCE_PATHS (Corridors Verticaux + Visual References)
      // ================================================================
      if (projectionMode === 'EXPERIENCE_PATHS') {
        const activePaths = paths.filter(p => {
          if (isolatedPathId && p.id !== isolatedPathId) return false;
          return true;
        });

        const allVisualNodes = projectFeaturePathsToVisualNodes(activePaths, allProposals);
        analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PROJECTION_STARTED", context: { projection: 'EXPERIENCE_PATHS', selectedPathCount: activePaths.length } });

        activePaths.forEach((path, pathIdx) => {
          const corridorX = pathIdx * 340;

          // Corridor Header Card
          generatedNodes.push({
            id: `header-${path.id}`,
            position: { x: corridorX, y: -80 },
            data: {
              label: (
                <div className="text-left cursor-pointer" onClick={() => setSelectedPathId(path.id)}>
                  <div className="font-bold text-xs text-blue-700 uppercase tracking-wider">Path {pathIdx + 1}</div>
                  <div className="font-bold text-sm text-slate-900 truncate">{path.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                      path.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                      path.status === 'INCOMPLETE' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {path.status}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{path.completeness}% complet</span>
                  </div>
                </div>
              )
            },
            style: {
              background: '#f8fafc',
              border: '2px solid #3b82f6',
              borderRadius: '8px',
              padding: '10px 14px',
              width: 280,
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            },
            selectable: false,
          });

          // Filter visual nodes for this path
          const pathVNodes = allVisualNodes.filter(vn => vn.pathId === path.id);

          const LAYER_Y_OFFSETS: Record<DesignLayer, number> = {
            INTENTION: 40,
            HYPOTHESIS: 180,
            CAPABILITY: 320,
            FEATURE: 480,
            JOURNEY: 660,
            SCREEN: 840,
          };

          const layerCounters: Record<DesignLayer, number> = {
            INTENTION: 0,
            HYPOTHESIS: 0,
            CAPABILITY: 0,
            FEATURE: 0,
            JOURNEY: 0,
            SCREEN: 0,
          };

          pathVNodes.forEach((vNode) => {
            if (!showHypotheses && vNode.layer === 'HYPOTHESIS') return;
            if (!showDeferred && vNode.status === 'DEFERRED') return;

            const itemIdx = layerCounters[vNode.layer]++;
            const startY = LAYER_Y_OFFSETS[vNode.layer] || 40;
            const isSelected = vNode.canonicalNodeId === selectedCanonicalId;
            const config = LAYER_CONFIG[vNode.layer] || LAYER_CONFIG.INTENTION;

            generatedNodes.push({
              id: vNode.projectionId,
              position: { x: corridorX, y: startY + itemIdx * 110 },
              data: {
                canonicalNodeId: vNode.canonicalNodeId,
                pathId: vNode.pathId,
                isVisualReference: vNode.isVisualReference,
                isShared: vNode.isShared,
                sharedUsageCount: vNode.sharedUsageCount,
                sharedAcrossPathIds: vNode.sharedAcrossPathIds,
                label: (
                  <div className="text-left">
                    <div className="font-bold text-xs text-slate-900 mb-1">
                      {config.icon} {vNode.title}
                    </div>
                    <div className="flex justify-between items-center gap-1 flex-wrap mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {vNode.layer}
                      </span>
                      {vNode.status === 'ACCEPTED' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold">
                          ✅ Validée
                        </span>
                      )}
                      {vNode.isShared && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium" title={`Réf. visuelle partagée dans ${vNode.sharedUsageCount} paths`}>
                          🔗 Partagé ({vNode.sharedUsageCount})
                        </span>
                      )}
                    </div>
                  </div>
                )
              },
              style: {
                background: isSelected ? '#eff6ff' : vNode.status === 'ACCEPTED' ? '#ffffff' : '#f8fafc',
                border: `2px solid ${isSelected ? '#3b82f6' : vNode.isShared ? '#818cf8' : vNode.status === 'ACCEPTED' ? '#22c55e' : config.border}`,
                borderRadius: '8px',
                padding: '10px',
                width: 280,
                boxShadow: isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.3)' : '0 1px 3px rgba(0,0,0,0.05)'
              }
            });
          });

          // Render Journey Steps Card if available
          if (path.primaryJourney) {
            const jData = path.primaryJourney.layerData as any;
            const steps: any[] = Array.isArray(jData?.steps) ? jData.steps : [];
            if (steps.length > 0) {
              generatedNodes.push({
                id: `steps-${path.id}`,
                position: { x: corridorX, y: 1020 },
                data: {
                  label: (
                    <div className="text-left">
                      <div className="font-bold text-xs text-orange-700 mb-2">🗺️ Étapes du Parcours ({steps.length})</div>
                      <div className="space-y-1 text-[11px] text-slate-700 max-h-36 overflow-y-auto">
                        {steps.map((st: any, idx: number) => (
                          <div key={idx} className="bg-orange-50/70 p-1.5 rounded border border-orange-100">
                            <span className="font-bold text-orange-800">{st.order || st.stepNumber || idx + 1}.</span> {st.userAction || st.action || 'Étape'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                },
                style: {
                  background: '#fff7ed',
                  border: '1.5px dashed #f97316',
                  borderRadius: '8px',
                  padding: '10px',
                  width: 280,
                },
                selectable: false,
              });
            }
          }
        });

        // Corridor vertical flow edges
        activePaths.forEach(path => {
          const connectCorridorLayers = (sourceLayerItems: DesignProposal[], targetLayerItems: DesignProposal[]) => {
            sourceLayerItems.forEach(sItem => {
              targetLayerItems.forEach(tItem => {
                const sId = `${path.id}__${sItem.id}`;
                const tId = `${path.id}__${tItem.id}`;
                generatedEdges.push({
                  id: `edge-${sId}-${tId}`,
                  source: sId,
                  target: tId,
                  animated: true,
                  style: { stroke: '#22c55e', strokeWidth: 2 },
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' }
                });
              });
            });
          };

          connectCorridorLayers(path.intentions, path.hypotheses);
          if (path.capabilities) {
            connectCorridorLayers(path.hypotheses, path.capabilities);
            connectCorridorLayers(path.capabilities, path.features.map(f => f.proposal));
          }
          connectCorridorLayers(path.features.map(f => f.proposal), path.journeys.map(j => j.proposal));
          connectCorridorLayers(path.journeys.map(j => j.proposal), path.screens.map(s => s.proposal));
        });
      }

      // ================================================================
      // PROJECTION 2 : STRATEGIC_MAP (INTENTION, HYPOTHESIS, CAPABILITY)
      // ================================================================
      else if (projectionMode === 'STRATEGIC_MAP') {
        const stratLayers: DesignLayer[] = ['INTENTION', 'HYPOTHESIS', 'CAPABILITY'];
        const stratProposals = proposals.filter(p => stratLayers.includes(p.layer));

        const layerY: Record<DesignLayer, number> = {
          INTENTION: 0, HYPOTHESIS: 180, CAPABILITY: 360, FEATURE: 0, JOURNEY: 0, SCREEN: 0
        };
        const layerCounts: Record<DesignLayer, number> = {
          INTENTION: 0, HYPOTHESIS: 0, CAPABILITY: 0, FEATURE: 0, JOURNEY: 0, SCREEN: 0
        };

        stratProposals.forEach(p => {
          if (!showHypotheses && p.layer === 'HYPOTHESIS') return;
          const idx = layerCounts[p.layer]++;
          const isSelected = p.id === selectedCanonicalId;
          const config = LAYER_CONFIG[p.layer];

          generatedNodes.push({
            id: p.id,
            position: { x: idx * 300, y: layerY[p.layer] },
            data: {
              canonicalNodeId: p.id,
              proposal: p,
              label: (
                <div className="text-left">
                  <div className="font-bold text-sm text-slate-900">{config.icon} {p.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{p.description?.slice(0, 80)}...</div>
                </div>
              )
            },
            style: {
              background: isSelected ? '#eff6ff' : '#ffffff',
              border: `2px solid ${isSelected ? '#3b82f6' : config.border}`,
              borderRadius: '10px',
              padding: '12px',
              width: 270,
            }
          });
        });

        // Edge connections for Strategic Map
        rawEdges.forEach(e => {
          const src = proposalMap.get(e.source as EntityId);
          const tgt = proposalMap.get(e.target as EntityId);
          if (src && tgt && stratLayers.includes(src.layer) && stratLayers.includes(tgt.layer)) {
            generatedEdges.push({
              id: e.id,
              source: e.source,
              target: e.target,
              style: { stroke: '#3b82f6', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
            });
          }
        });
      }

      // ================================================================
      // PROJECTION 3 : GLOBAL_GRAPH (Unique Node per Proposal + Shared Highlights)
      // ================================================================
      else if (projectionMode === 'GLOBAL_GRAPH') {
        const layerY: Record<DesignLayer, number> = {
          INTENTION: 0, HYPOTHESIS: 160, CAPABILITY: 320, FEATURE: 480, JOURNEY: 640, SCREEN: 800
        };
        const layerCounts: Record<DesignLayer, number> = {
          INTENTION: 0, HYPOTHESIS: 0, CAPABILITY: 0, FEATURE: 0, JOURNEY: 0, SCREEN: 0
        };

        proposals.forEach(p => {
          if (!showHypotheses && p.layer === 'HYPOTHESIS') return;
          if (!showDeferred && p.status === 'DEFERRED') return;

          const idx = layerCounts[p.layer]++;
          const usageCount = pathUsages.get(p.id)?.size || 1;
          const isShared = usageCount > 1;
          const isSelected = p.id === selectedCanonicalId;
          const config = LAYER_CONFIG[p.layer];

          generatedNodes.push({
            id: p.id,
            position: { x: idx * 280, y: layerY[p.layer] },
            data: {
              canonicalNodeId: p.id,
              proposal: p,
              label: (
                <div className="text-left">
                  <div className="font-bold text-xs text-slate-900">{config.icon} {p.title}</div>
                  <div className="flex justify-between items-center gap-1 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{p.layer}</span>
                    {isShared && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                        🔗 Partagé ({usageCount})
                      </span>
                    )}
                  </div>
                </div>
              )
            },
            style: {
              background: isSelected ? '#eff6ff' : p.status === 'ACCEPTED' ? '#ffffff' : '#f8fafc',
              border: `2px solid ${isSelected ? '#3b82f6' : isShared ? '#6366f1' : config.border}`,
              borderRadius: '8px',
              padding: '10px',
              width: 250,
            }
          });
        });

        rawEdges.forEach(e => {
          const isNav = e.kind === 'NAVIGATION';
          if (!showDependencies && isNav) return;
          generatedEdges.push({
            id: e.id,
            source: e.source,
            target: e.target,
            animated: isNav,
            style: { stroke: isNav ? '#3b82f6' : '#22c55e', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: isNav ? '#3b82f6' : '#22c55e' }
          });
        });
      }

      setNodes(generatedNodes);
      setEdges(generatedEdges);
      analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PROJECTION_COMPLETED", context: { projectedNodeCount: generatedNodes.length, projectedEdgeCount: generatedEdges.length, projection: projectionMode } });
    } catch (e) {
      console.error("Failed to load graph data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, projectionMode, selectedCanonicalId, showHypotheses, showDependencies, showDeferred, isolatedPathId, svc, setNodes, setEdges]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Load detailed NodePathContext when a node is selected
  useEffect(() => {
    if (selectedCanonicalId) {
      svc.designWorkshop.getNodePathContext(projectId as EntityId, selectedCanonicalId as EntityId)
        .then(ctx => setNodePathContext(ctx))
        .catch(err => console.error("Error loading node path context:", err));
    } else {
      setNodePathContext(null);
    }
  }, [selectedCanonicalId, projectId, svc]);

  const selectedProposal = useMemo(() => {
    if (!selectedCanonicalId) return null;
    return allProposals.find(p => p.id === selectedCanonicalId) || null;
  }, [selectedCanonicalId, allProposals]);

  const selectedPath = useMemo(() => {
    if (!selectedPathId) return null;
    return featurePaths.find(p => p.id === selectedPathId) || null;
  }, [selectedPathId, featurePaths]);

  const handleDeepSwarm = async (mode: 'expand' | 'alternatives') => {
    if (!selectedCanonicalId) return;
    setIsDeepSwarming(true);
    try {
      showToast(`⚡ Lancement de l'essaim (${mode === 'expand' ? 'Approfondir' : 'Alternatives'})...`);
      const res = await svc.designWorkshop.startDeepIdeationSwarm(projectId as EntityId, selectedCanonicalId as EntityId, mode);
      
      if (res.proposals && res.proposals.length > 0) {
        showToast(`✨ ${res.proposals.length} nouvelle(s) proposition(s) générée(s) et tissée(s) !`);
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
    if (!selectedCanonicalId) return;
    if (status === 'REJECTED' && nodePathContext && nodePathContext.sharedUsageCount > 1) {
      const confirmRefuse = confirm(`⚠️ ATTENTION : Cette proposition est partagée entre ${nodePathContext.sharedUsageCount} paths (${nodePathContext.impactScope.join(', ')}). Vouliez-vous vraiment la refuser ?`);
      if (!confirmRefuse) return;
    }

    try {
      await svc.designWorkshop.updateProposalStatus(selectedCanonicalId as EntityId, status);
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
            Cartographie &amp; Paths d&apos;Expérience (v0.15.0)
          </h2>
        </div>

        {/* Projection Mode Switcher */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button 
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${projectionMode === 'EXPERIENCE_PATHS' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setProjectionMode('EXPERIENCE_PATHS')}
          >
            🧭 Paths d&apos;Expérience (Corridors)
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${projectionMode === 'STRATEGIC_MAP' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setProjectionMode('STRATEGIC_MAP')}
          >
            🎯 Carte Stratégique
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${projectionMode === 'GLOBAL_GRAPH' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setProjectionMode('GLOBAL_GRAPH')}
          >
            🌐 Graphe Global
          </button>
        </div>

        {/* Unified Filter Controls */}
        <div className="flex gap-2 items-center text-xs flex-wrap">
          {/* Path Dropdown */}
          <select 
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-md font-medium text-slate-700 text-xs"
            value={isolatedPathId || ''}
            onChange={(e) => setIsolatedPathId(e.target.value || null)}
          >
            <option value="">Tous les Paths ({featurePaths.length})</option>
            {featurePaths.map((p, idx) => (
              <option key={p.id} value={p.id}>
                Path {idx + 1} : {p.title} ({p.status})
              </option>
            ))}
          </select>

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
            🔗 Dépendances {showDependencies ? '✓' : ''}
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md font-medium transition ${showDeferred ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => setShowDeferred(!showDeferred)}
          >
            📌 Reportés {showDeferred ? '✓' : ''}
          </button>
          <button 
            className={`px-3 py-1.5 rounded-md font-medium transition ${showOrphans ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'}`}
            onClick={() => setShowOrphans(!showOrphans)}
          >
            ⚠️ Orphelins {showOrphans ? '✓' : ''}
          </button>

          <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-medium" onClick={loadGraphData}>
            🔄 Rafraîchir
          </button>
          <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md font-medium border border-slate-300" onClick={() => { fitView({ padding: 0.2, duration: 800 }); analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_FITVIEW_EXECUTED", context: { fitViewExecuted: true }}); }}>
            🔍 Ajuster à l&apos;écran
          </button>
          <button
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium flex items-center gap-1.5"
            onClick={() => setIsExportModalOpen(true)}
            title="Télécharge la conception, les paths, la cartographie et les diagnostics dans un fichier ZIP."
          >
            📦 Exporter pour analyse
          </button>
          <button
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md font-medium"
            onClick={async () => {
              showToast("🖼️ Génération de l'image de la cartographie...");
              analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PNG_CAPTURE_STARTED" });
              const res = await exportMapImageOnly(project?.title, () => canvasRef.current);
              if (res.success) {
                analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PNG_CAPTURE_COMPLETED" });
              } else {
                analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "ERROR", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PNG_CAPTURE_FAILED", context: { reason: res.error, nodeCount: nodes.length, edgeCount: edges.length, containerWidth: canvasRef.current?.offsetWidth, containerHeight: canvasRef.current?.offsetHeight } });
              }
              if (res.success) {
                showToast(`✅ Image téléchargée : ${res.fileName}`);
              } else {
                showToast(`❌ Échec de la capture : ${res.error}`);
              }
            }}
            title="Télécharge uniquement l'image complète de la cartographie"
          >
            🖼️ Télécharger l&apos;image
          </button>
        </div>
      </div>

      {/* Main Canvas & Details Side Panels */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* ReactFlow Canvas Workspace */}
        <div className="flex-1 relative" ref={canvasRef} style={{ height: 'calc(100vh - 120px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <span>Chargement des Paths d&apos;Expérience...</span>
            </div>

          ) : featurePaths.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-slate-50">
              <p className="text-slate-500 text-lg font-medium">Aucun path d’expérience n’a pu être calculé.</p>
              <button className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
                ✨ Ouvrir l&apos;Atelier de Conception
              </button>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-slate-50">
              <p className="text-slate-500 text-lg font-medium">Les paths existent, mais aucun nœud visuel n’a pu être construit. Consultez les diagnostics.</p>
            </div>
          ) : (
            <ReactFlow

              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                const canonicalId = (node.data as any)?.canonicalNodeId || node.id;
                setSelectedCanonicalId(canonicalId);
                if (node.data?.pathId) setSelectedPathId(node.data.pathId);
              }}
              fitView
            >
              <FitViewHelper nodeCount={nodes.length} />
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
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedCanonicalId(null)}>
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

                {/* Node Path Context & Impact Scope */}
                {nodePathContext && (
                  <div className="bg-slate-900 text-slate-200 p-3 rounded-lg text-xs space-y-2">
                    <div className="font-bold text-blue-400 uppercase">Impact &amp; Contextualisation Path</div>
                    
                    {nodePathContext.sharedUsageCount > 1 && (
                      <div className="bg-amber-900/50 text-amber-200 p-2 rounded border border-amber-700/50 font-medium">
                        ⚠️ Cet élément est utilisé dans {nodePathContext.sharedUsageCount} paths. Toute modification peut avoir un impact transversal.
                      </div>
                    )}

                    <div>Présent dans <strong>{nodePathContext.sharedUsageCount}</strong> path(s) : {nodePathContext.pathIds?.join(', ') || 'N/A'}</div>

                    {nodePathContext.directParentIds?.length > 0 && (
                      <div><strong>Parents directs :</strong> {nodePathContext.directParentIds.join(', ')}</div>
                    )}
                    {nodePathContext.directChildIds?.length > 0 && (
                      <div><strong>Enfants directs :</strong> {nodePathContext.directChildIds.join(', ')}</div>
                    )}
                    {nodePathContext.intentionIds?.length > 0 && (
                      <div><strong>Intentions ancestrales :</strong> {nodePathContext.intentionIds.join(', ')}</div>
                    )}
                    {nodePathContext.hypothesisIds?.length > 0 && (
                      <div><strong>Hypothèses influentes :</strong> {nodePathContext.hypothesisIds.join(', ')}</div>
                    )}
                    {nodePathContext.capabilityIds?.length > 0 && (
                      <div><strong>Capabilities parentes :</strong> {nodePathContext.capabilityIds.join(', ')}</div>
                    )}
                    {nodePathContext.featureIds?.length > 0 && (
                      <div><strong>Features liées :</strong> {nodePathContext.featureIds.join(', ')}</div>
                    )}
                    {nodePathContext.journeyIds?.length > 0 && (
                      <div><strong>Journeys liés :</strong> {nodePathContext.journeyIds.join(', ')}</div>
                    )}
                    {nodePathContext.screenIds?.length > 0 && (
                      <div><strong>Screens liés :</strong> {nodePathContext.screenIds.join(', ')}</div>
                    )}

                    {nodePathContext.stepUsages?.length > 0 && (
                      <div>
                        <strong>Étape(s) de Parcours :</strong>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {nodePathContext.stepUsages.map((st: any, i: number) => (
                            <li key={i}>Étape {st.stepNumber || i + 1} : {st.userAction || st.stepAction || st.action || 'Action'}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {nodePathContext.warnings?.length > 0 && (
                      <div className="text-amber-300">
                        <strong>Avertissements :</strong> {nodePathContext.warnings.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Specialized Layer Data Display */}
                {selectedProposal.layerData && (
                  <div className="border-t border-slate-200 pt-3 mt-3 space-y-2">
                    <div className="text-xs font-bold text-blue-700 uppercase">Données Spécialisées</div>
                    <pre className="text-xs bg-slate-100 text-slate-800 p-2.5 rounded overflow-x-auto font-mono">
                      {JSON.stringify(selectedProposal.layerData, null, 2)}
                    </pre>
                  </div>
                )}
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
              </div>
            </div>
          </div>
        )}

        {/* Path Details Sidebar Panel */}
        {!selectedProposal && selectedPath && (
          <div className="w-96 bg-white border-l border-slate-200 p-5 overflow-y-auto shadow-xl z-20 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase tracking-wide">
                    Path d&apos;Expérience
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 m-0">{selectedPath.title}</h3>
                </div>
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedPathId(null)}>
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-sm text-slate-700">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div className="text-xs font-bold text-blue-800 uppercase mb-1">Objectif Utilisateur</div>
                  <p className="m-0 font-medium text-slate-800">{selectedPath.userGoal}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <div className="text-slate-400 font-bold uppercase">Entrée</div>
                    <div className="text-slate-800 font-medium mt-0.5">{selectedPath.entryPoint}</div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <div className="text-slate-400 font-bold uppercase">Résultat</div>
                    <div className="text-slate-800 font-medium mt-0.5">{selectedPath.finalOutcome}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Complétude du Path</div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full transition-all" style={{ width: `${selectedPath.completeness}%` }} />
                  </div>
                  <div className="text-xs text-right text-slate-500 font-mono mt-1">{selectedPath.completeness}%</div>
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-1 text-xs">
                  <div className="font-bold text-slate-800">Composition du Path :</div>
                  <div>- {selectedPath.featureIds.length} Fonctionnalités</div>
                  <div>- {selectedPath.stepReferences.length} Étapes de Parcours</div>
                  <div>- {selectedPath.screenIds.length} Écrans Matérialisés</div>
                  <div>- {selectedPath.sharedNodeIds.length} Nœuds Partagés avec d&apos;autres paths</div>
                </div>

                {selectedPath.warnings?.length > 0 && (
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1">
                    <div className="font-bold">Avertissements Path :</div>
                    <ul className="list-disc pl-4 m-0 space-y-0.5">
                      {selectedPath.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 mt-6 space-y-2">
              <button 
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold"
                onClick={() => setIsolatedPathId(selectedPath.id)}
              >
                🎯 Isoler uniquement ce Path
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportAnalysisModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        projectId={projectId as EntityId}
        projectTitle={project?.title}
        getMapElement={() => canvasRef.current}
        showToast={(msg) => showToast(msg)}
      />
    </div>
  );
}


export default function DesignMapPage() {
  return (
    <ReactFlowProvider>
      <DesignMapPageContent />
    </ReactFlowProvider>
  );
}
