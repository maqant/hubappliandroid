"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { analysisLogCollector } from "@/lib/export/analysis-log-collector";
import {
  useServices,
  type Project,
  type Source,
  type BriefItem,
  type Decision,
  type Conflict,
  type MissionManifest,
  type Finding,
  type ValidationGate,
  type Artifact,
  type Baseline,
  type ExecutionPackage,
  type RunEvent,
  type EntityId,
  type DesignLayer,
  type DesignProposal,
  type DesignBaselineSummary,
  type UpstreamContextPreview,
} from "@/services";
import { useTranslation } from "@/i18n";
import { ExportAnalysisModal } from "@/components/ExportAnalysisModal";

type TabId =
  | "sources"
  | "brief"
  | "design"
  | "decisions"
  | "organization"
  | "control"
  | "conflicts"
  | "blueprint"
  | "audits"
  | "baseline"
  | "package"
  | "settings";

const LAYER_INFO: Record<DesignLayer, { title: string; icon: string; desc: string; question: string }> = {
  INTENTION: { title: "Intention", icon: "🎯", desc: "La vision et les objectifs métier fondamentaux.", question: "Pourquoi ce produit existe-t-il ?" },
  HYPOTHESIS: { title: "Hypothèse", icon: "🔬", desc: "Les paris sur les utilisateurs et le marché à prouver.", question: "Que devons-nous valider ?" },
  CAPABILITY: { title: "Capacité", icon: "⚙️", desc: "Les grandes aptitudes que le système doit offrir.", question: "De quoi le système doit-il être capable ?" },
  FEATURE: { title: "Fonctionnalité", icon: "🧩", desc: "Les modules fonctionnels précis concrétisant les capacités.", question: "Comment le produit répond-il aux besoins ?" },
  JOURNEY: { title: "Parcours", icon: "🗺️", desc: "Les étapes vécues par l'utilisateur de bout en bout.", question: "Comment l'utilisateur navigue-t-il ?" },
  SCREEN: { title: "Écran", icon: "🖥️", desc: "Les vues et éléments d'interface affichés.", question: "Que voit et manipule l'utilisateur ?" },
};

const formatConfidence = (confidence?: number): string => {
  if (confidence === undefined || confidence === null) return "80%";
  const val = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(val)}%`;
};

export function ProjectDetailPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const projectId = params.id as string;
  const svc = useServices();
  const router = useRouter();
  const { t, lang } = useTranslation();

  const [project, setProject] = useState<Project | null>(null);
  
  const rawTab = searchParams.get("tab") as TabId | null;
  const validTabs: TabId[] = ["sources", "brief", "design", "decisions", "organization", "control", "conflicts", "blueprint", "audits", "baseline", "package", "settings"];
  const activeTab: TabId = rawTab && validTabs.includes(rawTab) ? rawTab : "sources";

  const handleTabChange = (newTab: TabId) => {
    router.replace(`${pathname}?tab=${newTab}`, { scroll: false });
  };
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);

  // Data states
  const [sources, setSources] = useState<Source[]>([]);
  const [briefItems, setBriefItems] = useState<BriefItem[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [missions, setMissions] = useState<MissionManifest[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [gates, setGates] = useState<ValidationGate[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [pkg, setPkg] = useState<ExecutionPackage | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [workshopResult, setWorkshopResult] = useState<any>(null);
  const [selectedLayer, setSelectedLayer] = useState<DesignLayer>("INTENTION");
  const [layerAgentStatuses, setLayerAgentStatuses] = useState<
    Record<string, Record<string, string>>
  >({});

  const updateAgentStatus = (layer: string, agentId: string, status: string) => {
    setLayerAgentStatuses((prev) => ({
      ...prev,
      [layer]: { ...(prev[layer] ?? {}), [agentId]: status },
    }));
  };

  const resetLayerStatuses = (layer: string) => {
    setLayerAgentStatuses((prev) => ({ ...prev, [layer]: {} }));
  };
  
  // Ideation Swarm states
  const [ideationIntensity, setIdeationIntensity] = useState<'STANDARD' | 'ABUNDANT' | 'EXHAUSTIVE'>('ABUNDANT');
  const brainstormingMode = true; // Mode créatif unique et permanent
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [isVariationModalOpen, setIsVariationModalOpen] = useState(false);
  const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false);
  const [userDiversityFocus, setUserDiversityFocus] = useState("");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>("ALL");
  const [generationSummaryModal, setGenerationSummaryModal] = useState<{
    open: boolean;
    title: string;
    receivedCount: number;
    addedCount: number;
    duplicateCount: number;
    invalidCount: number;
    toReviewCount: number;
    diversityFocus?: string | null;
  } | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());
  const [, setPersistedProposals] = useState<DesignProposal[]>([]);
  const [layerProposalCounts, setLayerProposalCounts] = useState<Record<string, number>>({});
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [featurePaths, setFeaturePaths] = useState<import("@pbh/domain").FeaturePath[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [upstreamPreview, setUpstreamPreview] = useState<UpstreamContextPreview | null>(null);
  const [upstreamPanelOpen, setUpstreamPanelOpen] = useState(false);
  const [deferredCount, setDeferredCount] = useState(0);
  const [userFeedbackText, setUserFeedbackText] = useState("");
  
  // UI states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFreezing, setIsFreezing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newSourceText, setNewSourceText] = useState("");
  const [newSourceLabel, setNewSourceLabel] = useState("");
  const [correctionText, setCorrectionText] = useState<Record<string, string>>({});
  const [resolveRationale, setResolveRationale] = useState("");
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const [baselineSummary, setBaselineSummary] = useState<DesignBaselineSummary | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const p = await svc.projects.getProject(projectId as EntityId);
      if (!p) {
        setError("Project not found");
        return;
      }
      setProject(p);
      const [src, brief, dec, conf, mis, bSummary] = await Promise.all([
        svc.sources.getSources(projectId as EntityId),
        svc.brief.getBriefItems(projectId as EntityId),
        svc.decisions.getDecisions(projectId as EntityId),
        svc.conflicts.getConflicts(projectId as EntityId),
        svc.missions.getMissions(projectId as EntityId),
        svc.designWorkshop.getDesignBaselineSummary(projectId as EntityId),
      ]);
      setSources(src);
      setBriefItems(brief);
      setDecisions(dec);
      setConflicts(conf);
      setMissions(mis);
      setBaselineSummary(bSummary);

      if (mis.length > 0) {
        const m = mis[0]!;
        const [f, g, a, b, ev] = await Promise.all([
          svc.audits.getFindings(m.id),
          svc.audits.getGates(m.id),
          svc.repos.artifacts.getByMissionId(m.id),
          svc.baselines.getBaselines(m.id),
          svc.missions.getMissionEvents(m.id),
        ]);
        setFindings(f);
        setGates(g);
        setArtifacts(a);
        setBaselines(b);
        setEvents(ev);

        if (b.length > 0) {
          const p2 = await svc.packages.getPackageByBaseline(b[0]!.id);
          setPkg(p2);
        }
      }
    } catch (err) {
      setError(lang === "fr" ? "Projet introuvable" : "Project not found");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, svc, lang]);

  useEffect(() => {
    load();
  }, [load]);

  // Load persisted proposals for the current layer
  const loadProposals = useCallback(async () => {
    try {
      const proposals = await svc.designWorkshop.getProposals(projectId as EntityId, selectedLayer);
      setPersistedProposals(proposals);
      // Map persisted proposals from repository ensuring layer property is set
      const mappedProposals = proposals.map(p => ({
        id: p.id,
        layer: p.layer || selectedLayer,
        title: p.title,
        description: p.description,
        shortPitch: p.shortPitch || p.title,
        type: p.category,
        originPerspective: p.originPerspective || 'Système',
        confidence: p.confidence || 50,
        priority: p.priority || 'MEDIUM',
        complexity: p.complexity || 'M',
        justification: p.rationale,
        userValue: p.userValue || '',
        dependencies: p.dependencyIds || [],
        childrenIds: p.childrenIds || [],
        parentId: p.parentId || null,
        status: p.status,
        generationBatchId: p.generationBatchId,
        generationMode: p.generationMode,
        variationIndex: p.variationIndex,
      }));

      // Ensure workshopResult is initialized if proposals exist
      if (proposals.length > 0) {
        setWorkshopResult(prev => ({
          ...prev,
          proposals: mappedProposals,
          summary: prev?.summary || `${proposals.length} propositions existantes pour la couche ${selectedLayer}`,
          questions: prev?.questions || [],
          assumptions: prev?.assumptions || [],
          warnings: prev?.warnings || [],
        }));
      }
    } catch (e) {
      console.error('Failed to load proposals:', e);
    }
    // Also load counts for all layers
    try {
      const layers: DesignLayer[] = ['INTENTION', 'HYPOTHESIS', 'CAPABILITY', 'FEATURE', 'JOURNEY', 'SCREEN'];
      const counts: Record<string, number> = {};
      for (const layer of layers) {
        const ps = await svc.designWorkshop.getProposals(projectId as EntityId, layer);
        counts[layer] = ps.length;
      }
      setLayerProposalCounts(counts);
    } catch (e) {
      console.error('Failed to load layer counts:', e);
    }
  }, [projectId, selectedLayer, svc, workshopResult]);

  // Load proposals when switching to design tab or changing layer
  useEffect(() => {
    if (activeTab === 'design') {
      loadProposals();
    }
  }, [activeTab, selectedLayer, loadProposals]);

  // Load upstream context preview when layer changes (design tab)
  useEffect(() => {
    if (activeTab !== 'design' || !projectId) return;
    svc.designWorkshop.getUpstreamContextPreview(projectId as EntityId, selectedLayer)
      .then(preview => setUpstreamPreview(preview))
      .catch(() => setUpstreamPreview(null));
  }, [activeTab, selectedLayer, projectId, svc]);

  // Load deferred count across all layers
  useEffect(() => {
    if (activeTab !== 'design' || !projectId) return;
    const allLayers: DesignLayer[] = ['INTENTION', 'HYPOTHESIS', 'CAPABILITY', 'FEATURE', 'JOURNEY', 'SCREEN'];
    Promise.all(allLayers.map(l => svc.designWorkshop.getProposals(projectId as EntityId, l)))
      .then(results => {
        const count = results.flatMap(r => r).filter(p => p.status === 'DEFERRED').length;
        setDeferredCount(count);
      })
      .catch(() => {});
  }, [activeTab, projectId, svc]);

  // Clear feedback text when switching selected proposal
  useEffect(() => {
    setUserFeedbackText("");
  }, [selectedProposalId]);

  // ---- Actions ----

  const addSource = async () => {
    if (!newSourceText.trim()) return;
    await svc.sources.addSource(
      projectId as EntityId,
      "TEXT",
      newSourceLabel || "Additional source",
      newSourceText,
    );
    setNewSourceText("");
    setNewSourceLabel("");
    showToast("success", lang === "fr" ? "Source ajoutée avec succès" : "Source added");
    load();
  };

  const analyze = async () => {
    setIsAnalyzing(true);
    try {
      await svc.brief.analyzeBrief(projectId as EntityId);
      showToast(
        "success",
        lang === "fr"
          ? "Analyse terminée — examinez les éléments du brief ci-dessous"
          : "Analysis complete — review the brief items below",
      );
      handleTabChange("brief");
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAcceptAllBriefItems = async () => {
    if (isAcceptingAll) return;
    setIsAcceptingAll(true);
    try {
      await svc.brief.acceptAllProposed(projectId as EntityId);
      showToast(
        "success",
        lang === "fr"
          ? "Tous les éléments du brief ont été acceptés !"
          : "All brief items accepted!",
      );
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsAcceptingAll(false);
    }
  };

  const handleBriefAction = async (
    itemId: string,
    action: "accept" | "correct" | "reject",
  ) => {
    try {
      if (action === "accept") await svc.brief.acceptItem(itemId as EntityId);
      else if (action === "reject") await svc.brief.rejectItem(itemId as EntityId);
      else if (action === "correct") {
        const text = correctionText[itemId];
        if (!text?.trim()) {
          showToast(
            "error",
            lang === "fr" ? "Veuillez entrer le texte de correction" : "Enter the corrected text",
          );
          return;
        }
        await svc.brief.correctItem(itemId as EntityId, text);
        setCorrectionText((p) => {
          const n = { ...p };
          delete n[itemId];
          return n;
        });
      }

      let msg = `Item ${action}ed`;
      if (lang === "fr") {
        if (action === "accept") msg = t("accept.success");
        else if (action === "reject") msg = t("reject.success");
        else if (action === "correct") msg = t("correct.success");
      }
      showToast("success", msg);
      load();
    } catch (err: any) {
      const errMsg = String(err.message || err);
      if (
        errMsg.includes("Aucune modification à enregistrer") ||
        errMsg.includes("No modifications to save")
      ) {
        showToast("info", t("idempotent.noChange"));
      } else {
        showToast("error", errMsg);
      }
    }
  };

  const planMission = async () => {
    setIsPlanning(true);
    try {
      await svc.missions.planMission(projectId as EntityId, `Mission pour ${project?.name}`);
      showToast(
        "success",
        lang === "fr"
          ? "Mission planifiée — examinez l'organisation"
          : "Mission planned — review the agents and tasks",
      );
      handleTabChange("organization");
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApproveArtifact = async (artifactId: string) => {
    try {
      await svc.baselines.approveArtifact(artifactId as EntityId);
      showToast(
        "success",
        lang === "fr" ? "Document approuvé avec succès" : "Document approved successfully",
      );
      load();
    } catch (err) {
      showToast("error", String(err));
    }
  };

  const currentLayerProposals = useMemo(() => {
    if (persistedProposals && persistedProposals.length > 0) {
      return persistedProposals.map((p: any) => ({
        id: p.id,
        layer: p.layer || selectedLayer,
        title: p.title,
        description: p.description,
        shortPitch: p.shortPitch || p.title,
        type: p.category,
        originPerspective: p.originPerspective || 'Système',
        confidence: p.confidence || 50,
        priority: p.priority || 'MEDIUM',
        complexity: p.complexity || 'M',
        justification: p.rationale,
        userValue: p.userValue || '',
        dependencies: p.dependencyIds || [],
        childrenIds: p.childrenIds || [],
        parentId: p.parentId || null,
        status: p.status,
        generationBatchId: p.generationBatchId,
        generationMode: p.generationMode,
        variationIndex: p.variationIndex,
      }));
    }
    if (!workshopResult?.proposals) return [];
    return workshopResult.proposals.filter((p: any) => !p.layer || p.layer === selectedLayer);
  }, [persistedProposals, workshopResult, selectedLayer]);

  const batches = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    currentLayerProposals.forEach((p: any) => {
      const bId = p.generationBatchId || 'LEGACY';
      if (!map.has(bId)) {
        let label = "Génération antérieure";
        if (p.generationBatchId) {
          if (p.generationMode === 'INITIAL' || p.variationIndex === 0) label = "Génération initiale";
          else if (p.generationMode === 'REPLACEMENT') label = `Remplacement (Var ${p.variationIndex || 1})`;
          else label = `Variation ${p.variationIndex || 1}`;
        }
        map.set(bId, { id: bId, label, count: 0 });
      }
      map.get(bId)!.count++;
    });
    return Array.from(map.values());
  }, [currentLayerProposals]);

  const lastBatch = useMemo(() => {
    const valid = batches.filter(b => b.id !== 'LEGACY');
    return valid.length > 0 ? valid[valid.length - 1] : null;
  }, [batches]);

  const filteredProposals = useMemo(() => {
    if (selectedBatchFilter === 'ALL') return currentLayerProposals;
    return currentLayerProposals.filter((p: any) => (p.generationBatchId || 'LEGACY') === selectedBatchFilter);
  }, [currentLayerProposals, selectedBatchFilter]);

  const executeGeneration = async (mode: 'INITIAL' | 'VARIATION' | 'REPLACEMENT' = 'INITIAL', focus?: string, sourceBatchId?: string | null) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    resetLayerStatuses(selectedLayer);
    try {
      const result = await svc.designWorkshop.generateProposals(
        projectId as EntityId,
        selectedLayer,
        ideationIntensity,
        true,
        (agentId, status) => {
          updateAgentStatus(selectedLayer, agentId, status);
        },
        {
          generationMode: mode,
          sourceBatchId: sourceBatchId || null,
          userDiversityFocus: focus || undefined,
          onLog: (event: any) => {
            analysisLogCollector.addEntry({
              timestamp: new Date().toISOString(),
              level: "INFO",
              category: event.category || "GENERATION",
              message: event.message,
              context: event.context
            });
          }
        }
      );
      setWorkshopResult(result);
      load();
      loadProposals();

      const added = result.addedCount ?? result.proposals?.length ?? 0;
      const received = result.receivedCount ?? result.proposals?.length ?? 0;
      const dupes = result.duplicateCount ?? 0;
      const invalid = result.diagnostic?.invalidCount ?? 0;

      if (added === 0 && mode !== 'INITIAL') {
        showToast("info", "Aucune proposition suffisamment différente n'a été trouvée. Essayez un angle d'exploration plus précis.");
      } else {
        showToast("success", mode === 'INITIAL' ? "Génération initiale terminée" : mode === 'REPLACEMENT' ? "Remplacement terminé" : "Nouvelle variation terminée");
      }

      setGenerationSummaryModal({
        open: true,
        title: mode === 'INITIAL' ? "Génération initiale terminée" : mode === 'REPLACEMENT' ? "Remplacement terminé" : "Nouvelle variation terminée",
        receivedCount: received,
        addedCount: added,
        duplicateCount: dupes,
        invalidCount: invalid,
        toReviewCount: added,
        diversityFocus: result.userDiversityFocus || focus || null
      });
    } catch (e: any) {
      setGenerationError(e.message || String(e));
      showToast("error", e.message || String(e));
    } finally {
      setIsGenerating(false);
      setIsVariationModalOpen(false);
      setIsReplacementModalOpen(false);
      setUserDiversityFocus("");
    }
  };

  const handleGenerateProposals = () => executeGeneration(currentLayerProposals.length === 0 ? 'INITIAL' : 'VARIATION');
  void isReplacementModalOpen;
  void setSelectedBatchFilter;
  void lastBatch;
  void handleGenerateProposals;

  const handleProposalAction = async (proposalId: string, action: 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'PROPOSED') => {
    try {
      await svc.designWorkshop.updateProposalStatus(proposalId as EntityId, action);
      // Update workshopResult in-place for instant UI feedback
      setWorkshopResult((prev: any) => {
        if (!prev?.proposals) return prev;
        return {
          ...prev,
          proposals: prev.proposals.map((p: any) =>
            p.id === proposalId ? { ...p, status: action } : p
          ),
        };
      });
      const labels: Record<string, string> = { ACCEPTED: 'acceptée', REJECTED: 'refusée', DEFERRED: 'reportée à la roadmap', PROPOSED: 'réinitialisée' };
      showToast("success", `Proposition ${labels[action] || action}`);
      loadProposals(); // Reload counts
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleFeedbackThenAction = async (proposalId: string, action: 'ACCEPTED' | 'DEFERRED') => {
    const feedback = userFeedbackText.trim();
    if (!feedback || isSubmittingAction) return;
    setIsSubmittingAction(true);
    try {
      const updated = await svc.designWorkshop.submitUserFeedback(proposalId as EntityId, feedback);
      setWorkshopResult((prev: any) => {
        if (!prev?.proposals) return prev;
        return {
          ...prev,
          proposals: prev.proposals.map((p: any) =>
            p.id === proposalId ? { ...p, justification: updated.rationale } : p
          ),
        };
      });
      await handleProposalAction(proposalId, action);
      setUserFeedbackText("");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleBulkAccept = async () => {
    for (const id of selectedProposalIds) {
      await handleProposalAction(id, 'ACCEPTED');
    }
    setSelectedProposalIds(new Set());
  };

  const handleDownloadRoadmap = async () => {
    try {
      const md = await svc.designWorkshop.generateDeferredRoadmap(projectId as EntityId);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roadmap-deferred-${projectId}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', '📋 Roadmap des idées reportées générée et téléchargée !');
    } catch (e: any) {
      showToast('error', e.message || String(e));
    }
  };

  const handleFreezeDesignBaseline = async () => {
    if (!window.confirm("Geler la baseline de conception ? Les propositions acceptées seront scellées comme référence pour la mission.")) return;
    setIsFreezing(true);
    try {
      await svc.designWorkshop.freezeBaseline(projectId as EntityId, "v1", "User");
      showToast("success", "Conception validée avec succès ! La mission peut maintenant être lancée dans l'onglet Organisation.");
      await load(); // Reload project to update designStatus to 'VALIDATED'
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsFreezing(false);
    }
  };


  const handleGenerateVerticalPaths = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    showToast("info", "🚀 Lancement de l'essaimage vertical (CAPABILITY -> FEATURE -> JOURNEY -> SCREEN)...");
    try {
      const res = await svc.designWorkshop.generateVerticalPathsFromCapabilities(
        projectId as EntityId,
        ideationIntensity,
        brainstormingMode
      );
      setFeaturePaths(res.paths);
      showToast("success", res.summary);
      await loadProposals();
    } catch (e: any) {
      setGenerationError(e.message || String(e));
      showToast("error", e.message || String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleArbitratePath = async (capabilityId: EntityId, action: 'ACCEPT_PROPOSED' | 'DEFER_PROPOSED' | 'REJECT_BRANCH') => {
    try {
      const res = await svc.designWorkshop.arbitratePath(projectId as EntityId, capabilityId, action);
      const labels = { ACCEPT_PROPOSED: 'acceptées', DEFER_PROPOSED: 'reportées à la roadmap', REJECT_BRANCH: 'refusées' };
      showToast("success", `${res.updatedCount} proposition(s) du path ${labels[action]}`);
      await loadProposals();
      const updatedPaths = await svc.designWorkshop.getFeaturePaths(projectId as EntityId);
      setFeaturePaths(updatedPaths);
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const runMission = async () => {
    console.log("runMission: Start clicked, missions length:", missions.length);
    if (missions.length === 0) return;
    handleTabChange("control");
    setIsRunning(true);
    try {
      console.log("runMission: Calling executeMission for", missions[0]!.id);
      const result = await svc.missions.executeMission(missions[0]!.id, {
        onProgress: (done, total) => {
          console.log(`runMission progress: ${done}/${total}`);
          showToast(
            "info",
            lang === "fr"
              ? `Progression : ${done}/${total} tâches`
              : `Progress: ${done}/${total} tasks`,
          );
        },
      });
      console.log("runMission: executeMission completed, status:", result.status);
      if (result.status === "PARTIAL_FAILURE") {
        const notRun = result.tasks.filter((t) => t.status === "NOT_RUN").length;
        const failed = result.tasks.filter((t) => t.status === "FAILED").length;
        showToast(
          "error",
          lang === "fr"
            ? `Échec partiel : ${failed} échouée(s), ${notRun} non exécutée(s). Utilisez "Reprendre" pour réessayer.`
            : `Partial failure: ${failed} failed, ${notRun} not run. Use "Resume" to retry.`,
        );
      } else {
        showToast("success", lang === "fr" ? "Mission terminée" : "Mission completed");
      }
      console.log("runMission: calling load()");
      await load();
      console.log("runMission: load() completed");
    } catch (err) {
      console.error("ERROR IN runMission:", err);
      showToast("error", String(err));
      await load();
    } finally {
      setIsRunning(false);
      console.log("runMission: finished, isRunning set to false");
    }
  };

  const resumeMission = async () => {
    if (missions.length === 0) return;
    setIsRunning(true);
    try {
      const result = await svc.missions.resumeMission(missions[0]!.id, {
        onProgress: (done, total) => {
          showToast(
            "info",
            lang === "fr"
              ? `Reprise : ${done}/${total} tâches`
              : `Resuming: ${done}/${total} tasks`,
          );
        },
      });
      if (result.status === "PARTIAL_FAILURE") {
        const notRun = result.tasks.filter((t) => t.status === "NOT_RUN").length;
        const failed = result.tasks.filter((t) => t.status === "FAILED").length;
        showToast(
          "error",
          lang === "fr"
            ? `Échec partiel : ${failed} échouée(s), ${notRun} non exécutée(s).`
            : `Partial failure: ${failed} failed, ${notRun} not run.`,
        );
      } else {
        showToast("success", lang === "fr" ? "Mission terminée" : "Mission completed");
      }
      await load();
    } catch (err) {
      console.error("ERROR IN resumeMission:", err);
      showToast("error", String(err));
      await load();
    } finally {
      setIsRunning(false);
    }
  };

  const resolveConflict = async (conflictId: string, optionId: string) => {
    try {
      await svc.conflicts.resolveConflict(
        conflictId as EntityId,
        optionId as EntityId,
        resolveRationale || "User decision",
        projectId as EntityId,
      );
      showToast("success", lang === "fr" ? "Arbitrage enregistré" : "Conflict resolved");
      setResolveRationale("");
      load();
    } catch (err) {
      showToast("error", String(err));
    }
  };

  const runAudits = async () => {
    if (missions.length === 0) return;
    setIsAuditing(true);
    try {
      await svc.audits.runAudits(missions[0]!.id);
      showToast("success", lang === "fr" ? "Audits terminés" : "Audits completed");
      handleTabChange("audits");
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsAuditing(false);
    }
  };

  const freezeBaseline = async () => {
    if (missions.length === 0) return;
    setIsFreezing(true);
    try {
      await svc.baselines.freezeBaseline(missions[0]!.id);
      showToast("success", lang === "fr" ? "Version de référence gelée" : "Baseline frozen");
      handleTabChange("baseline");
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsFreezing(false);
    }
  };

  const generatePackage = async () => {
    if (baselines.length === 0) return;
    setIsGenerating(true);
    try {
      await svc.packages.generatePackage(baselines[0]!.id);
      showToast("success", lang === "fr" ? "Paquet final généré avec succès" : "Package generated");
      handleTabChange("package");
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPackage = () => {
    if (!pkg) return;
    const blob = new Blob([pkg.masterConsolidated], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MASTER-CONSOLIDATED.txt";
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", lang === "fr" ? "Téléchargement lancé" : "Download started");
  };

  const downloadDiagnosticJson = async () => {
    if (missions.length === 0) return;
    try {
      const runs = await svc.missions.getMissionRuns(missions[0]!.id);
      const diagnostics = runs.map((run) => {
        const task = missions[0]!.tasks.find((t) => t.id === run.taskId);
        return {
          taskId: run.taskId,
          agentId: task?.agentId || "Unknown",
          modelTier: run.modelTier,
          status: run.status,
          durationMs: run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime() : 0,
          diagnostic: run.diagnostic,
          error: run.error,
        };
      });
      const blob = new Blob([JSON.stringify({ missionId: missions[0]!.id, runs: diagnostics }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagnostic-openai-${missions[0]!.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", lang === "fr" ? "Diagnostic téléchargé" : "Diagnostic downloaded");
    } catch (err) {
      showToast("error", String(err));
    }
  };

  // ---- Render ----

  if (isLoading)
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>{lang === "fr" ? "Chargement du projet..." : "Loading project..."}</span>
      </div>
    );
  if (error)
    return (
      <div className="page-content">
        <div className="toast toast-error" style={{ position: "static" }}>
          {error}
        </div>
      </div>
    );
  if (!project) return null;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "sources", label: `📄 ${t("tab.sources")}`, count: sources.length },
    { id: "brief", label: `💡 ${t("tab.brief")}`, count: briefItems.length },
    { id: "design", label: `📐 Conception Assistée` },
    { id: "decisions", label: `⚖️ ${t("tab.decisions")}`, count: decisions.length },
    {
      id: "organization",
      label: `🏗️ ${t("tab.organization")}`,
      count: missions.length > 0 ? missions[0]!.agents.length : 0,
    },
    {
      id: "control",
      label: `🎮 ${t("tab.control")}`,
      count: missions.length > 0 ? missions[0]!.tasks.length : 0,
    },
    { id: "conflicts", label: `⚡ ${t("tab.conflicts")}`, count: conflicts.length },
    { id: "blueprint", label: `📘 ${t("tab.blueprint")}`, count: artifacts.length },
    { id: "audits", label: `🔍 ${t("tab.audits")}`, count: findings.length },
    { id: "baseline", label: `📌 ${t("tab.baseline")}`, count: baselines.length },
    { id: "package", label: `📦 ${t("tab.package")}` },
    { id: "settings", label: `⚙️ ${t("tab.settings")}` },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          {project.description && <p className="text-sm text-muted">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span 
            className={`badge ${svc.provider.name === 'openai' ? 'badge-openai' : 'badge-demo'}`} 
            onClick={() => router.push('/settings/ai')} 
            style={{ cursor: 'pointer' }}
            title="Cliquer pour configurer le provider IA dans les paramètres"
          >
            {svc.provider.name === 'openai' ? '🟢 IA Réelle (OpenAI)' : '🟡 Mode Démo (Fake)'}
          </span>
          <span className={`badge badge-${project.status.toLowerCase()}`}>
            {project.status === "ACTIVE"
              ? lang === "fr"
                ? "Actif"
                : "Active"
              : project.status === "ARCHIVED"
                ? lang === "fr"
                  ? "Archivé"
                  : "Archived"
                : project.status}
          </span>
        </div>
      </div>

      <div className="page-content">
        {/* Tabs */}
        <div className="tabs" style={{ overflowX: "auto" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${activeTab === t.id ? "tab-active" : ""}`}
              onClick={() => handleTabChange(t.id)}
            >
              {t.label}{" "}
              {t.count !== undefined && t.count > 0 && (
                <span className="badge badge-info" style={{ marginLeft: 4 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "sources" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("tab.sources")}</h2>
              <button
                className="btn btn-primary"
                onClick={analyze}
                disabled={isAnalyzing || (!project.ideaText && sources.length === 0)}
              >
                {isAnalyzing ? (
                  <>
                    <div
                      className="loading-spinner"
                      style={{ width: 14, height: 14, borderWidth: 2 }}
                    />{" "}
                    {t("action.loading")}
                  </>
                ) : lang === "fr" ? (
                  "🔬 Analyser mon idée"
                ) : (
                  "🔬 Analyze my idea"
                )}
              </button>
            </div>

            {project.ideaText && (
              <div className="card mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4>💡 {lang === "fr" ? "Idée originale" : "Original Idea"}</h4>
                  <span className="badge badge-info">
                    {lang === "fr" ? "Principale" : "Primary"}
                  </span>
                </div>
                <p className="text-sm" style={{ whiteSpace: "pre-wrap" }}>
                  {project.ideaText}
                </p>
              </div>
            )}

            {sources.map((s) => (
              <div key={s.id} className="card mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4>{s.label}</h4>
                  <span className="badge badge-draft">{s.type}</span>
                </div>
                <p
                  className="text-sm"
                  style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}
                >
                  {s.content}
                </p>
                <div className="text-xs text-muted mt-2">{s.segments.length} segments</div>
              </div>
            ))}

            {/* Add source */}
            <div className="card mt-6">
              <h4 className="mb-4">{lang === "fr" ? "Ajouter une Source" : "Add a Source"}</h4>
              <div className="mb-4">
                <label htmlFor="source-label" className="label">
                  {lang === "fr" ? "Nom" : "Label"}
                </label>
                <input
                  id="source-label"
                  className="input"
                  value={newSourceLabel}
                  onChange={(e) => setNewSourceLabel(e.target.value)}
                  placeholder={lang === "fr" ? "ex: Notes de réunion" : "e.g., Meeting notes"}
                />
              </div>
              <div className="mb-4">
                <label htmlFor="source-text" className="label">
                  {lang === "fr" ? "Contenu" : "Content"}
                </label>
                <textarea
                  id="source-text"
                  className="textarea"
                  value={newSourceText}
                  onChange={(e) => setNewSourceText(e.target.value)}
                  placeholder={
                    lang === "fr"
                      ? "Collez du texte additionnel, des notes ou du contexte..."
                      : "Paste additional text, notes, or context..."
                  }
                />
              </div>
              <button
                className="btn btn-secondary"
                onClick={addSource}
                disabled={!newSourceText.trim()}
              >
                {lang === "fr" ? "Ajouter la Source" : "Add Source"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "brief" && (
          <div>
            {(() => {
              const proposedCount = briefItems.filter((b) => b.status === "PROPOSED").length;
              return (
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2>
                    {lang === "fr" ? "Compréhension du Brief" : "Brief — What the Hub Understood"}
                  </h2>
                  <div className="flex items-center gap-3">
                    {briefItems.length > 0 && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleAcceptAllBriefItems}
                        disabled={proposedCount === 0 || isAcceptingAll}
                        title={
                          lang === "fr"
                            ? "Accepte d'un seul clic tous les éléments proposés"
                            : "Accept all proposed items with a single click"
                        }
                      >
                        {isAcceptingAll ? "⏳..." : `⚡ ${lang === "fr" ? "Tout Accepter" : "Accept All"}${proposedCount > 0 ? ` (${proposedCount})` : ""}`}
                      </button>
                    )}
                    <span className="badge badge-demo">AI Demo</span>
                  </div>
                </div>
              );
            })()}
            {briefItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">💡</div>
                <h3>{lang === "fr" ? "Aucun élément de brief" : "No brief items yet"}</h3>
                <p>
                  {lang === "fr"
                    ? 'Allez dans l\'onglet Sources et cliquez sur "Analyser mon idée" pour générer le brief.'
                    : 'Go to the Sources tab and click "Analyze my idea" to generate the brief.'}
                </p>
              </div>
            ) : (
              <div>
                {(() => {
                  const activeCounts = briefItems.reduce((acc, b) => {
                    if (b.status !== "REJECTED") {
                      const key = b.statement.trim().toLowerCase();
                      acc[key] = (acc[key] || 0) + 1;
                    }
                    return acc;
                  }, {} as Record<string, number>);

                  return briefItems.map((item) => {
                    const isDuplicate =
                      (activeCounts[item.statement.trim().toLowerCase()] || 0) > 1;
                    return (
                      <div key={item.id} className="card mb-4">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className={`badge badge-${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                          <span className="badge badge-info">{item.type}</span>
                          <span className="text-xs text-muted">
                            {lang === "fr" ? "Confiance : " : "Confidence: "}
                            {Math.round(item.confidence * 100)}%
                          </span>
                          {item.status === "CORRECTED" && (
                            <span className="badge badge-success text-xs">
                              ✨{" "}
                              {lang === "fr"
                                ? "Version active transmise à l'IA"
                                : "Active version sent to AI"}
                            </span>
                          )}
                          {isDuplicate && (
                            <span
                              className="badge badge-warning text-xs"
                              title={
                                lang === "fr"
                                  ? "Élément en doublon. Cliquez sur Refuser (❌) sur l'un des deux."
                                  : "Duplicate item. Click Reject (❌) on one of them."
                              }
                            >
                              ⚠️ {lang === "fr" ? "Doublon potentiel" : "Potential duplicate"}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold mb-2">{item.statement}</p>
                        {item.excerpt && (
                          <p className="text-xs text-muted mb-3">
                            Source: &quot;{item.excerpt.slice(0, 100)}...&quot;
                          </p>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleBriefAction(item.id, "accept")}
                            disabled={item.status === "ACCEPTED" || item.status === "LOCKED"}
                          >
                            ✅ {t("action.accept")}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleBriefAction(item.id, "reject")}
                          >
                            ❌ {t("action.reject")}
                          </button>
                        </div>

                        {/* Correction */}
                        <div className="flex gap-2 mt-3">
                          <input
                            className="input"
                            style={{ flex: 1 }}
                            placeholder={
                              lang === "fr" ? "Saisir une correction..." : "Enter correction..."
                            }
                            value={correctionText[item.id] ?? ""}
                            onChange={(e) =>
                              setCorrectionText((p) => ({ ...p, [item.id]: e.target.value }))
                            }
                          />
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleBriefAction(item.id, "correct")}
                            disabled={!correctionText[item.id]?.trim()}
                          >
                            ✏️ {t("action.correct")}
                          </button>
                        </div>

                        {/* Version history */}
                        {item.previousVersions.length > 0 && (
                          <details className="mt-3">
                            <summary className="text-xs text-muted" style={{ cursor: "pointer" }}>
                              {lang === "fr"
                                ? `Historique des versions (${item.previousVersions.length})`
                                : `Version history (${item.previousVersions.length})`}
                            </summary>
                            <p className="text-xs text-muted mt-1 italic">
                              {lang === "fr"
                                ? "💡 Seule la version active ci-dessus est prise en compte par l'IA. Les anciennes versions ci-dessous sont conservées comme archive."
                                : "💡 Only the active version above is used by AI. Older versions below are archived."}
                            </p>
                            {item.previousVersions.map((v, i) => (
                              <div
                                key={i}
                                className="text-xs text-muted mt-1"
                                style={{ paddingLeft: 16 }}
                              >
                                v{v.version}: [{v.status}] {v.statement}
                              </div>
                            ))}
                          </details>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {briefItems.length > 0 && (
              <div className="mt-6">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={planMission}
                  disabled={isPlanning || missions.length > 0}
                >
                  {isPlanning ? (
                    <>
                      <div
                        className="loading-spinner"
                        style={{ width: 14, height: 14, borderWidth: 2 }}
                      />{" "}
                      {t("action.loading")}
                    </>
                  ) : missions.length > 0 ? (
                    `✅ ${lang === "fr" ? "Mission déjà planifiée" : "Mission Already Planned"}`
                  ) : (
                    `🏗️ ${t("org.planBtn")}`
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        {activeTab === "design" && (
          <div className="tab-pane fade-in flex flex-col h-full" style={{ minHeight: "60vh" }}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h2>Conception Assistée</h2>
                <p className="text-xs text-muted">Structurez votre produit par couches et validez les propositions générées par l&apos;essaim d&apos;IA.</p>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsExportModalOpen(true)}
                  title="Exporter la conception complète pour analyse externe"
                >
                  📦 Exporter pour analyse
                </button>
                <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}/design/map`)}>
                  🗺️ Cartographie d&apos;Impact
                </button>
                {project?.designStatus === "VALIDATED" ? (
                  <span className="badge badge-success text-sm py-1.5 px-3">
                    ✅ Conception Validée (Baseline Gelée)
                  </span>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    onClick={handleFreezeDesignBaseline} 
                    disabled={isFreezing}
                  >
                    {isFreezing ? "⏳ Validation..." : "📌 Valider la Conception (Geler la Baseline)"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-4 flex-1">
              {/* Zone Couches */}
              <div className="card p-4 w-64 bg-surface flex flex-col gap-2">
                <h3 className="text-sm font-semibold mb-2">Couches de Conception</h3>
                {(['INTENTION', 'HYPOTHESIS', 'CAPABILITY', 'FEATURE', 'JOURNEY', 'SCREEN'] as const).map(layer => {
                  const info = LAYER_INFO[layer];
                  const isSel = selectedLayer === layer;
                  return (
                    <button 
                      key={layer} 
                      className={`btn text-left w-full flex flex-col gap-1 ${isSel ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setSelectedLayer(layer);
                        setWorkshopResult(null);
                        setSelectedProposalId(null);
                        setSelectedProposalIds(new Set());
                      }}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span>{info.icon} {layer}</span>
                        <span className={`badge ${(layerProposalCounts[layer] || 0) > 0 ? 'badge-info' : ''}`}>{layerProposalCounts[layer] || 0}</span>
                      </div>
                      <span className="text-[10px] opacity-75 font-normal text-left">{info.question}</span>
                    </button>
                  );
                })}

                <div className="mt-4 p-3 bg-muted rounded-md text-xs">
                  <div className="font-semibold text-primary mb-1">
                    {LAYER_INFO[selectedLayer].icon} {LAYER_INFO[selectedLayer].title}
                  </div>
                  <p className="text-muted mb-1">{LAYER_INFO[selectedLayer].desc}</p>
                  <div className="italic text-gray-500">❓ {LAYER_INFO[selectedLayer].question}</div>
                </div>
              </div>

              {/* Zone Propositions */}
              <div className="card p-4 flex-1 bg-surface flex flex-col">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                  <div className="flex gap-4 items-center flex-wrap">
                    <h3 className="font-semibold m-0">Essaim d&apos;Idéation</h3>
                    <select 
                      className="input input-sm max-w-[200px]" 
                      value={ideationIntensity} 
                      onChange={e => setIdeationIntensity(e.target.value as any)}
                    >
                      <option value="STANDARD">Standard (3 perspectives)</option>
                      <option value="ABUNDANT">Abondante (5 perspectives)</option>
                      <option value="EXHAUSTIVE">Exhaustive (8 perspectives)</option>
                    </select>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {selectedLayer === 'FEATURE' && (() => {
                      const hasAcceptedIntention = briefItems.some(b => b.status === 'ACCEPTED' || b.status === 'LOCKED');
                      const hasAcceptedCapability = (layerProposalCounts['CAPABILITY'] || 0) > 0;
                      const canSwarmPaths = hasAcceptedIntention && hasAcceptedCapability;

                      return (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleGenerateVerticalPaths}
                          disabled={isGenerating || !canSwarmPaths}
                          title={
                            !canSwarmPaths
                              ? "Pour débloquer l'essaim vertical : validez au moins 1 Intention et 1 Capacité (CAPABILITY) dans l'atelier !"
                              : "Tisse automatiquement les fonctionnalités, parcours et écrans de bout en bout sous forme de Feature Paths"
                          }
                        >
                          {isGenerating ? '⏳ Tissage vertical…' : '🚀 Générer les paths fonctionnels (Cascades 4→6)'}
                        </button>
                      );
                    })()}
                    {currentLayerProposals.length === 0 ? (
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => executeGeneration('INITIAL')}
                        disabled={isGenerating}
                      >
                        {isGenerating ? '⏳ Exploration…' : `✨ Essaimer (${selectedLayer})`}
                      </button>
                    ) : (
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => setIsVariationModalOpen(true)}
                        disabled={isGenerating}
                        title="Explore de nouvelles propositions pour cette couche en tenant compte de celles déjà générées. Les propositions actuelles sont conservées."
                      >
                        {isGenerating ? '⏳ Exploration…' : '✨ Nouvelle variation'}
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsExportModalOpen(true)}
                      title="Télécharge la conception, les paths, la cartographie et les diagnostics dans un fichier ZIP."
                    >
                      📦 Exporter pour analyse
                    </button>
                  </div>
                  {deferredCount > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleDownloadRoadmap}
                      title={`${deferredCount} idée(s) reportée(s) — exporter en roadmap .md`}
                    >
                      📋 Roadmap DEFERRED ({deferredCount})
                    </button>
                  )}
                </div>
                {generationError && <p className="text-sm text-red-600 mb-2">{generationError}</p>}
                
                {(() => {
                  const activeSwarmStatuses = layerAgentStatuses[selectedLayer] ?? {};
                  const entries = Object.entries(activeSwarmStatuses);
                  if (entries.length === 0) return null;
                  return (
                    <div className="mb-4 p-3 bg-muted rounded-md text-sm">
                      <h4 className="font-semibold mb-2">
                        Progression de l&apos;Essaim ({selectedLayer})
                      </h4>
                      {entries.map(([agentId, status]) => (
                        <div
                          key={agentId}
                          className="flex justify-between items-center py-1 border-b border-border last:border-0"
                        >
                          <span>{agentId}</span>
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              status === "done"
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : status === "running"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                : status === "error"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                          >
                            {status === "done"
                              ? "terminé"
                              : status === "running"
                              ? "en cours"
                              : status === "error"
                              ? "erreur"
                              : "en attente"}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                
                {/* Encart synthétique des Feature Paths générés */}
                {featurePaths.length > 0 && (
                  <div className="p-3 mb-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md text-xs">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                        🚀 {featurePaths.length} Feature Path(s) fonctionnel(s) tissé(s) :
                      </div>
                      {selectedPathId && (
                        <button
                          className="text-emerald-700 underline text-xs"
                          onClick={() => setSelectedPathId(null)}
                        >
                          Afficher tous les paths
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {featurePaths.map((fp) => {
                        const isSel = selectedPathId === fp.id;
                        return (
                          <div
                            key={fp.id}
                            className={`p-2 rounded border cursor-pointer ${
                              isSel ? 'border-emerald-600 bg-emerald-100 dark:bg-emerald-900/40' : 'border-emerald-200 bg-white dark:bg-neutral-800'
                            }`}
                            onClick={() => setSelectedPathId(isSel ? null : fp.id)}
                          >
                            <div className="font-medium text-emerald-900 dark:text-emerald-200">
                              Path : {fp.title || fp.capabilityProposal?.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {fp.features.length} Fonct. • {fp.journeys.length} Parcours • {fp.screens.length} Écrans • [{fp.status}]
                            </div>
                            <div className="flex gap-1 mt-1">
                              <button
                                className="px-1.5 py-0.5 text-[10px] bg-emerald-600 text-white rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const targetId = fp.capabilityProposal?.id || fp.primaryJourneyId || fp.id;
                                  if (targetId) handleArbitratePath(targetId as EntityId, 'ACCEPT_PROPOSED');
                                }}
                              >
                                Tout accepter
                              </button>
                              <button
                                className="px-1.5 py-0.5 text-[10px] bg-amber-600 text-white rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const targetId = fp.capabilityProposal?.id || fp.primaryJourneyId || fp.id;
                                  if (targetId) handleArbitratePath(targetId as EntityId, 'DEFER_PROPOSED');
                                }}
                              >
                                Reporter
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Encart Éléments de Brief Confirmés */}
                {briefItems.filter(b => b.status === 'LOCKED' || b.status === 'ACCEPTED' || b.status === 'CORRECTED').length > 0 && (
                  <div className="p-3 mb-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-md text-xs">
                    <div className="font-semibold text-indigo-900 dark:text-indigo-200 mb-1">
                      💡 {briefItems.filter(b => b.status === 'LOCKED' || b.status === 'ACCEPTED' || b.status === 'CORRECTED').length} Élément(s) du Brief Confirmé(s) pris en compte par l&apos;Essaim :
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {briefItems.filter(b => b.status === 'LOCKED' || b.status === 'ACCEPTED' || b.status === 'CORRECTED').slice(0, 4).map(b => (
                        <li key={b.id} className="text-indigo-800 dark:text-indigo-300">
                          <strong>[{b.type}]</strong> {b.statement}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Panneau Contexte Amont validé (UpstreamContextPanel) */}
                {upstreamPreview && selectedLayer !== 'INTENTION' && (
                  <div className="mb-4 text-xs">
                    {upstreamPreview.hasUpstream ? (
                      <div className="border border-emerald-200 dark:border-emerald-800 rounded-md overflow-hidden">
                        <button
                          className="w-full flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/20 text-left"
                          onClick={() => setUpstreamPanelOpen(o => !o)}
                        >
                          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                            🧬 {upstreamPreview.items.length} proposition(s) validée(s) des couches amont ({upstreamPreview.upstreamLayers.join(', ')}) transmises aux agents
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400">{upstreamPanelOpen ? '▲ Masquer' : '▼ Voir'}</span>
                        </button>
                        {upstreamPanelOpen && (
                          <div className="p-3 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-auto">
                            {upstreamPreview.items.map(item => (
                              <div key={item.id} className="py-1.5 flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{item.layer}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  item.status === 'ACCEPTED' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>{item.status}</span>
                                <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{item.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                        ⚠️ <strong>Aucune proposition validée en amont</strong> — les agents travailleront uniquement depuis le brief.
                        Validez d&apos;abord des propositions des couches&nbsp;
                        <strong>{upstreamPreview.upstreamLayers.join(', ')}</strong>
                        &nbsp;pour un meilleur tissage.
                      </div>
                    )}
                  </div>
                )}

                {workshopResult ? (
                  <div className="flex-1 flex flex-col gap-4 overflow-auto">
                    {workshopResult.diagnostic && (
                      <div className="flex justify-between items-center bg-muted p-2 rounded text-sm">
                        <span>Status: {workshopResult.diagnostic.parseStatus}</span>
                        <button className="btn btn-sm" onClick={() => {
                          const blob = new Blob([JSON.stringify(workshopResult.diagnostic, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `diagnostic-${selectedLayer}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}>
                          Télécharger le diagnostic
                        </button>
                      </div>
                    )}
                    
                    {workshopResult.summary && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                        <h4 className="font-semibold mb-1 text-blue-800 dark:text-blue-200">Ce que le HUB a compris</h4>
                        <p className="text-sm">{workshopResult.summary}</p>
                      </div>
                    )}

                    {currentLayerProposals.length > 0 && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold text-lg">
                            Propositions ({filteredProposals.length})
                          </h4>
                          {selectedProposalIds.size > 0 && (
                            <div className="flex gap-2">
                              <span className="text-sm font-medium pt-1 mr-2">{selectedProposalIds.size} sélectionnées</span>
                              <button className="btn btn-sm" onClick={() => setSelectedProposalIds(new Set())}>Effacer</button>
                              <button className="btn btn-sm btn-primary" onClick={handleBulkAccept}>Accepter la sélection</button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {filteredProposals.map((p: any, idx: number) => {
                            const isSelected = selectedProposalId === p.id;
                            const isChecked = selectedProposalIds.has(p.id);
                            return (
                              <div 
                                key={p.id || idx} 
                                onClick={() => setSelectedProposalId(p.id)}
                                className={`p-4 border rounded-md cursor-pointer transition-all ${
                                  isSelected ? 'border-primary shadow-md ring-1 ring-primary' : 'border-border hover:border-gray-400'
                                } ${brainstormingMode ? 'bg-surface relative' : 'bg-surface'}`}
                                tabIndex={0}
                                role="option"
                                aria-selected={isSelected}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedProposalId(p.id);
                                  }
                                }}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex items-start gap-2 flex-1">
                                    <input 
                                      type="checkbox" 
                                      className="mt-1"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const next = new Set(selectedProposalIds);
                                        if (e.target.checked) next.add(p.id);
                                        else next.delete(p.id);
                                        setSelectedProposalIds(next);
                                      }}
                                    />
                                    <div>
                                      <div className="font-semibold text-base mb-1">{p.title}</div>
                                      <div className="text-sm text-muted">{p.shortPitch || p.description?.substring(0, 100) + '...'}</div>
                                    </div>
                                  </div>
                                  {p.status && p.status !== 'PROPOSED' && (
                                    <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                                      p.status === 'ACCEPTED' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                      p.status === 'REJECTED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                      p.status === 'DEFERRED' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                      p.status === 'LOCKED' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {p.status === 'ACCEPTED' ? '✅ Acceptée' : p.status === 'REJECTED' ? '❌ Refusée' : p.status === 'DEFERRED' ? '⏸️ Reportée' : p.status === 'LOCKED' ? '🔒 Verrouillée' : p.status}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3 items-center">
                                  {p.originPerspective && (
                                    <span className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
                                      💡 {p.originPerspective}
                                    </span>
                                  )}
                                  {p.type && <span className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-2 py-1 rounded">{p.type}</span>}
                                  {p.confidence !== undefined && <span className="text-xs text-muted">Confiance: {formatConfidence(p.confidence)}</span>}
                                  {p.childrenIds && p.childrenIds.length > 0 && (
                                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">+{p.childrenIds.length} sous-idées</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {workshopResult.questions?.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-amber-700 dark:text-amber-400">Questions (À résoudre)</h4>
                        <div className="flex flex-col gap-2">
                          {workshopResult.questions.map((q: any, idx: number) => (
                            <div key={idx} className="p-3 border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10 rounded-md">
                              <div className="font-medium text-sm mb-1">{q.statement}</div>
                              {q.importance && <div className="text-xs text-amber-800 dark:text-amber-300 mb-2">Importance : {q.importance}</div>}
                              <div className="flex gap-2">
                                <input type="text" placeholder="Répondre ici..." className="input input-sm flex-1 text-xs" />
                                <button className="btn btn-sm btn-primary text-xs">Enregistrer</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {workshopResult.assumptions?.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-purple-700 dark:text-purple-400">Hypothèses à valider</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {workshopResult.assumptions.map((a: any, idx: number) => (
                            <div key={idx} className="p-3 border border-purple-200 bg-purple-50 dark:border-purple-900/50 dark:bg-purple-900/10 rounded-md">
                              <div className="font-medium text-sm mb-1">{a.statement}</div>
                              {a.impact && <div className="text-xs text-purple-800 dark:text-purple-300 mb-3">Impact : {a.impact}</div>}
                              <div className="flex flex-wrap gap-2">
                                <button className="btn btn-sm bg-purple-600 hover:bg-purple-700 text-white text-xs border-none">Confirmer</button>
                                <button className="btn btn-sm bg-white text-gray-800 border-gray-300 hover:bg-gray-50 text-xs">Corriger</button>
                                <button className="btn btn-sm bg-red-50 text-red-600 border-red-200 hover:bg-red-100 text-xs">Refuser</button>
                                <button className="btn btn-sm text-xs bg-transparent border-dashed">Décider plus tard</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {workshopResult.warnings?.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-red-600 dark:text-red-400">Avertissements</h4>
                        <ul className="list-disc pl-5 text-sm">
                          {workshopResult.warnings.map((w: any, idx: number) => (
                            <li key={idx} className="text-red-600 dark:text-red-400">{w.message} {w.severity && <span className="text-xs">[{w.severity}]</span>}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted border-2 border-dashed border-border rounded-lg p-6 text-center gap-2">
                    <p className="text-base font-medium">Aucune proposition affichée pour la couche {selectedLayer}.</p>
                    <p className="text-xs">Cliquez sur &quot;✨ Essaimer ({selectedLayer})&quot; pour générer des idées.</p>
                  </div>
                )}
              </div>

              {/* Zone Détail */}
              <div className="card p-4 w-96 bg-surface flex flex-col overflow-y-auto">
                <h3 className="font-semibold mb-4">Détails</h3>
                {selectedProposalId && (currentLayerProposals.length > 0 || workshopResult?.proposals) ? (() => {
                  const p = currentLayerProposals.find((p: any) => p.id === selectedProposalId) || (workshopResult?.proposals ? workshopResult.proposals.find((p: any) => p.id === selectedProposalId) : null);
                  if (!p) return <div className="text-muted">Proposition introuvable</div>;
                  return (
                    <div className="flex flex-col gap-4 text-sm">
                      <div>
                        <h4 className="font-bold text-base">{p.title}</h4>
                        {p.originPerspective && <div className="text-xs text-indigo-600 mb-2">Issue de : {p.originPerspective}</div>}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {p.type && <span className="badge badge-neutral">{p.type}</span>}
                          {p.priority && <span className="badge badge-warning">Prio: {p.priority}</span>}
                          {p.complexity && <span className="badge badge-info">Complexité: {p.complexity}</span>}
                        </div>
                      </div>

                      {p.description && (
                        <div>
                          <h5 className="font-semibold text-muted text-xs uppercase">Description</h5>
                          <p>{p.description}</p>
                        </div>
                      )}

                      {p.justification && (
                        <div>
                          <h5 className="font-semibold text-muted text-xs uppercase">Justification</h5>
                          <p className="italic whitespace-pre-wrap">{p.justification}</p>
                        </div>
                      )}

                      {p.userValue && (
                        <div>
                          <h5 className="font-semibold text-muted text-xs uppercase">Valeur Utilisateur</h5>
                          <p>{p.userValue}</p>
                        </div>
                      )}

                      {p.dependencies && p.dependencies.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-muted text-xs uppercase">Dépendances</h5>
                          <ul className="list-disc pl-4">
                            {p.dependencies.map((d: string, i: number) => <li key={i}>{d}</li>)}
                          </ul>
                        </div>
                      )}

                      <div className="border-t border-border pt-4 mt-2 flex flex-col gap-3">
                        {/* Zone Status et En-tête */}
                        <div className="flex justify-between items-center">
                          <h5 className="font-semibold text-xs uppercase text-muted">Arbitrage</h5>
                          {p.status && p.status !== 'PROPOSED' && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              p.status === 'ACCEPTED' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              p.status === 'REJECTED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                              p.status === 'DEFERRED' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {p.status === 'ACCEPTED' ? '✅ Acceptée' : p.status === 'REJECTED' ? '❌ Refusée' : p.status === 'DEFERRED' ? '📋 Reportée' : p.status}
                            </span>
                          )}
                        </div>

                        {/* Zone 1 : Actions Directes (en l'état) */}
                        <div className="flex flex-col gap-1.5">
                          <button 
                            className="btn btn-sm btn-primary w-full text-xs justify-start" 
                            onClick={() => handleProposalAction(p.id, 'ACCEPTED')}
                            disabled={p.status === 'ACCEPTED' || isSubmittingAction}
                          >
                            ✅ Accepter en l&apos;état
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              className="btn btn-sm btn-secondary text-xs" 
                              onClick={() => handleProposalAction(p.id, 'REJECTED')}
                              disabled={p.status === 'REJECTED' || isSubmittingAction}
                            >
                              ❌ Refuser
                            </button>
                            <button 
                              className="btn btn-sm btn-secondary text-xs" 
                              onClick={() => handleProposalAction(p.id, 'DEFERRED')}
                              disabled={p.status === 'DEFERRED' || isSubmittingAction}
                            >
                              📋 Prévoir à la Roadmap
                            </button>
                          </div>
                        </div>

                        {/* Zone 2 : Actions avec Remarques / Observations */}
                        <div className="mt-2 pt-3 border-t border-border">
                          <h5 className="font-semibold mb-1 text-xs uppercase text-muted">Ce que je voudrais changer / Observations</h5>
                          <textarea 
                            className="input w-full text-xs h-20 mb-2" 
                            placeholder="Saisissez ici vos remarques, corrections ou précisions..."
                            value={userFeedbackText}
                            onChange={(e) => setUserFeedbackText(e.target.value)}
                            disabled={isSubmittingAction}
                          />
                          <div className="flex flex-col gap-1.5">
                            <button 
                              className="btn btn-sm btn-secondary w-full text-xs"
                              onClick={() => handleFeedbackThenAction(p.id, 'ACCEPTED')}
                              disabled={!userFeedbackText.trim() || isSubmittingAction}
                              title={!userFeedbackText.trim() ? "Saisissez d'abord vos remarques ci-dessus" : "Enregistre vos remarques et accepte la proposition"}
                            >
                              📝 Accepter avec remarques
                            </button>
                            <button 
                              className="btn btn-sm btn-secondary w-full text-xs"
                              onClick={() => handleFeedbackThenAction(p.id, 'DEFERRED')}
                              disabled={!userFeedbackText.trim() || isSubmittingAction}
                              title={!userFeedbackText.trim() ? "Saisissez d'abord vos observations ci-dessus" : "Enregistre vos observations et reporte à la roadmap"}
                            >
                              💬 Prévoir à la Roadmap (avec obs.)
                            </button>
                          </div>
                        </div>

                        {/* Zone 3 : Réinitialisation discrète */}
                        {p.status && p.status !== 'PROPOSED' && (
                          <div className="pt-2 border-t border-border mt-1">
                            <button 
                              className="btn btn-sm w-full text-xs bg-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-dashed"
                              onClick={() => handleProposalAction(p.id, 'PROPOSED')}
                              disabled={isSubmittingAction}
                            >
                              ↩️ Réinitialiser (repasser en examen)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="flex-1 flex items-center justify-center text-muted border-2 border-dashed border-border rounded-lg p-4 text-center">
                    Sélectionnez une proposition pour voir ses détails et agir dessus.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "decisions" && (
          <div>
            <h2 className="mb-4">{t("tab.decisions")}</h2>
            {decisions.length === 0 ? (
              <div className="empty-state" style={{ whiteSpace: "pre-line" }}>
                <div className="empty-state-icon">⚖️</div>
                <h3>{lang === "fr" ? "Aucune décision pour le moment" : "No decisions yet"}</h3>
                <p>{t("empty.decisions")}</p>
              </div>
            ) : (
              decisions.map((d) => (
                <div key={d.id} className="card mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`badge badge-${d.status.toLowerCase()}`}>{d.status}</span>
                    <h4>{d.title}</h4>
                  </div>
                  <p className="mb-2">{d.statement}</p>
                  <p className="text-sm text-muted">
                    {lang === "fr" ? "Justification : " : "Rationale: "}
                    {d.rationale}
                  </p>
                  {d.sourceExcerpt && (
                    <div
                      style={{
                        marginTop: "var(--space-2)",
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        paddingTop: "var(--space-2)",
                      }}
                    >
                      <span className="text-xs text-muted" style={{ display: "block" }}>
                        🔗{" "}
                        {lang === "fr"
                          ? "Source (Brief verrouillé) : "
                          : "Source (Locked Brief) : "}
                        &quot;{d.sourceExcerpt}&quot;
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "organization" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("org.title")}</h2>
              {missions.length > 0 && missions[0]!.status === "PLANNED" && (
                <div className="flex items-center gap-4">
                  {project?.designStatus !== "VALIDATED" && (
                    <div className="text-sm text-warning flex items-center gap-2">
                      <span>⚠️</span>
                      La conception doit être validée avant de lancer la mission.
                    </div>
                  )}
                  <button 
                    className="btn btn-primary" 
                    onClick={runMission} 
                    disabled={isRunning || project?.designStatus !== "VALIDATED"}
                  >
                    {isRunning ? (
                      <>
                        <div
                          className="loading-spinner"
                          style={{ width: 14, height: 14, borderWidth: 2 }}
                        />{" "}
                        {t("action.loading")}
                      </>
                    ) : (
                      `▶️ ${t("org.startBtn")}`
                    )}
                  </button>
                </div>
              )}
            </div>

            <p className="text-sm text-muted mb-6">{t("org.desc")}</p>

            {/* Brief Statistics Card */}
            <div
              className="card mb-6"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <h3 className="mb-3" style={{ fontSize: "var(--font-size-md)" }}>
                📊 {t("org.stats.title")}
              </h3>
              <div className="grid grid-5 text-center gap-2">
                <div
                  style={{
                    padding: "var(--space-2)",
                    background: "rgba(255,255,255,0.01)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span className="text-xs text-muted block">{t("org.stats.total")}</span>
                  <strong className="text-lg block mt-1">{briefItems.length}</strong>
                </div>
                <div
                  style={{
                    padding: "var(--space-2)",
                    background: "rgba(34,197,94,0.05)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span className="text-xs text-muted block" style={{ color: "rgb(34,197,94)" }}>
                    {t("org.stats.accepted")}
                  </span>
                  <strong className="text-lg block mt-1" style={{ color: "rgb(34,197,94)" }}>
                    {briefItems.filter((b) => b.status === "ACCEPTED").length}
                  </strong>
                </div>
                <div
                  style={{
                    padding: "var(--space-2)",
                    background: "rgba(59,130,246,0.05)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span className="text-xs text-muted block" style={{ color: "rgb(59,130,246)" }}>
                    {t("org.stats.locked")}
                  </span>
                  <strong className="text-lg block mt-1" style={{ color: "rgb(59,130,246)" }}>
                    {briefItems.filter((b) => b.status === "LOCKED").length}
                  </strong>
                </div>
                <div
                  style={{
                    padding: "var(--space-2)",
                    background: "rgba(239,68,68,0.05)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span className="text-xs text-muted block" style={{ color: "rgb(239,68,68)" }}>
                    {t("org.stats.rejected")}
                  </span>
                  <strong className="text-lg block mt-1" style={{ color: "rgb(239,68,68)" }}>
                    {briefItems.filter((b) => b.status === "REJECTED").length}
                  </strong>
                </div>
                <div
                  style={{
                    padding: "var(--space-2)",
                    background: "rgba(234,179,8,0.05)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span className="text-xs text-muted block" style={{ color: "rgb(234,179,8)" }}>
                    {t("org.stats.remaining")}
                  </span>
                  <strong className="text-lg block mt-1" style={{ color: "rgb(234,179,8)" }}>
                    {
                      briefItems.filter((b) => b.status === "PROPOSED" || b.status === "CORRECTED")
                        .length
                    }
                  </strong>
                </div>
              </div>
            </div>

            {/* Design Baseline & Swarm Summary Card */}
            <div
              className="card mb-6"
              style={{
                background: "rgba(59,130,246,0.03)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="m-0 flex items-center gap-2" style={{ fontSize: "var(--font-size-md)", color: "var(--color-primary)" }}>
                  🧠 Statistiques &amp; Résumé de la Conception (Essaims)
                </h3>
                {baselineSummary?.baselineId ? (
                  <span className={`badge ${baselineSummary.isStale ? "badge-warning" : "badge-success"}`}>
                    {baselineSummary.isStale 
                      ? `⚠️ Baseline gelée périmée (${baselineSummary.staleCount} nouvelles idées acceptées)`
                      : `📌 Baseline active : ${baselineSummary.versionLabel || 'v1'}`}
                  </span>
                ) : (
                  <span className="badge badge-info">
                    ℹ️ Aucune baseline gelée (toutes les propositions acceptées seront transmises)
                  </span>
                )}
              </div>

              {baselineSummary ? (
                <div>
                  <p className="text-sm mb-4" style={{ background: "rgba(255,255,255,0.03)", padding: "12px 16px", borderRadius: "6px", borderLeft: "3px solid var(--color-primary)" }}>
                    <strong>Grand Résumé de la Conception transmis aux agents :</strong><br />
                    {baselineSummary.executiveSummary}
                  </p>

                  <div className="grid grid-6 text-center gap-2 mb-4">
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                      <span className="text-xs text-muted block">🎯 Intentions</span>
                      <strong className="text-md block mt-1">{baselineSummary.acceptedByLayer.INTENTION}</strong>
                    </div>
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                      <span className="text-xs text-muted block">🔬 Hypothèses</span>
                      <strong className="text-md block mt-1">{baselineSummary.acceptedByLayer.HYPOTHESIS}</strong>
                    </div>
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                      <span className="text-xs text-muted block">⚙️ Capacités</span>
                      <strong className="text-md block mt-1">{baselineSummary.acceptedByLayer.CAPABILITY}</strong>
                    </div>
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                      <span className="text-xs text-muted block">🧩 Fonctions</span>
                      <strong className="text-md block mt-1">{baselineSummary.acceptedByLayer.FEATURE}</strong>
                    </div>
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                      <span className="text-xs text-muted block">🗺️ Parcours</span>
                      <strong className="text-md block mt-1">{baselineSummary.acceptedByLayer.JOURNEY}</strong>
                    </div>
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                      <span className="text-xs text-muted block">🖥️ Écrans</span>
                      <strong className="text-md block mt-1">{baselineSummary.acceptedByLayer.SCREEN}</strong>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-muted pt-2 border-t border-border">
                    <span>Total propositions d&apos;essaims : <strong>{baselineSummary.totals.proposals}</strong> (<strong>{baselineSummary.totals.accepted}</strong> retenues/validées, {baselineSummary.totals.rejected} refusées)</span>
                    <button className="btn btn-secondary btn-sm" onClick={handleFreezeDesignBaseline}>
                      📌 Re-geler la baseline de conception
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted">Chargement du résumé de conception...</div>
              )}
            </div>

            {missions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏗️</div>
                <h3>{lang === "fr" ? "Aucune mission planifiée" : "No mission planned"}</h3>
                <p>{t("empty.organization")}</p>
                {briefItems.length > 0 && (
                  <button className="btn btn-primary mt-4" onClick={() => handleTabChange("brief")}>
                    👈 {lang === "fr" ? "Aller au brief" : "Go to brief"}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <h3 className="mb-4">
                  {t("org.agentsList")} ({missions[0]!.agents.length})
                </h3>
                <div className="grid grid-3">
                  {missions[0]!.agents.map((a) => {
                    const transName = t(`agent.name.${a.agentId}` as any);
                    const transPurpose = t(`agent.purpose.${a.agentId}` as any);
                    const agentName = transName.startsWith("agent.name.") ? a.name : transName;
                    const agentPurpose = transPurpose.startsWith("agent.purpose.")
                      ? a.purpose
                      : transPurpose;

                    return (
                      <div key={a.id} className="card">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`badge ${a.type === "FIXED" ? "badge-locked" : "badge-info"}`}
                          >
                            {a.type === "FIXED" ? (lang === "fr" ? "Fixe" : "Fixed") : "Dynamic"}
                          </span>
                          <h4 style={{ fontSize: "var(--font-size-sm)" }}>{agentName}</h4>
                        </div>
                        <p className="text-xs text-muted">{agentPurpose}</p>
                        {!a.removable && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--status-locked)", marginTop: "var(--space-1)" }}
                          >
                            🔒 {lang === "fr" ? "Requis" : "Required"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "control" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("control.title")}</h2>
              <div className="flex gap-2">
                {missions.length > 0 && missions[0]!.status === "PARTIAL_FAILURE" && !isRunning && (
                  <button className="btn btn-primary" onClick={resumeMission}>
                    🔄 {lang === "fr" ? "Reprendre les tâches non terminées" : "Resume Incomplete Tasks"}
                  </button>
                )}
                {missions.length > 0 && missions[0]!.status !== "PLANNED" && missions[0]!.status !== "RUNNING" && (
                  <button className="btn btn-secondary" onClick={downloadDiagnosticJson}>
                    ⬇️ {lang === "fr" ? "Télécharger le diagnostic JSON" : "Download JSON Diagnostic"}
                  </button>
                )}
              </div>
            </div>
            {missions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎮</div>
                <h3>{lang === "fr" ? "Aucune mission en cours" : "No mission running"}</h3>
                <p>{t("empty.control")}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className={`badge badge-${missions[0]!.status.toLowerCase()}`}>
                    {t(("status." + missions[0]!.status.toLowerCase()) as any)}
                  </span>
                  <span className="text-sm text-muted">
                    {lang === "fr" ? "Budget consommé : " : "Budget: "}
                    {missions[0]!.usedBudgetTokens.toLocaleString()} /{" "}
                    {missions[0]!.totalBudgetTokens.toLocaleString()} tokens
                  </span>
                  <span className="text-sm text-muted">
                    {lang === "fr" ? "Appels : " : "Calls: "}
                    {missions[0]!.totalCalls}
                  </span>
                </div>
                <div className="progress-bar mb-6">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.round((missions[0]!.tasks.filter((t) => t.status === "COMPLETED").length / Math.max(missions[0]!.tasks.length, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <h3 className="mb-4">
                  {lang === "fr" ? "Tâches" : "Tasks"} ({missions[0]!.tasks.length})
                </h3>
                {missions[0]!.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="card mb-3"
                    style={{ padding: "var(--space-3) var(--space-4)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`badge badge-${t.status.toLowerCase().replace("_", "-")}`}>
                          {lang === "fr"
                            ? t.status === "COMPLETED"
                              ? "Terminée"
                              : t.status === "PENDING"
                                ? "En attente"
                                : t.status === "FAILED"
                                  ? "Échouée"
                                  : t.status === "NOT_RUN"
                                    ? "Non exécutée"
                                    : t.status
                            : t.status === "NOT_RUN"
                              ? "Not Run"
                              : t.status}
                        </span>
                        <span className="text-sm font-semibold">
                          {(() => {
                            if (lang === "fr") {
                              if (t.name.includes("Analysis"))
                                return `Analyse — ${t.name.replace(" Analysis", "")}`;
                              if (t.name.includes("Design"))
                                return `Conception — ${t.name.replace(" Design", "")}`;
                              if (t.name.includes("Audit"))
                                return `Audit — ${t.name.replace(" Audit", "")}`;
                            }
                            return t.name;
                          })()}
                        </span>
                        <span className="badge badge-info">{t.modelTier}</span>
                      </div>
                      <span className="text-xs text-muted">{t.agentId}</span>
                    </div>
                  </div>
                ))}

                {events.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-4">
                      {lang === "fr" ? "Journal des événements" : "Events"} ({events.length})
                    </h3>
                    {events
                      .slice(-10)
                      .reverse()
                      .map((e) => (
                        <div key={e.id} className="text-sm mb-2 flex items-center gap-2">
                          <span className="text-xs text-muted">
                            {new Date(e.createdAt).toLocaleTimeString()}
                          </span>
                          <span className="badge badge-info">{e.type}</span>
                          <span>{e.message}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "conflicts" && (
          <div>
            <h2 className="mb-4">{t("tab.conflicts")}</h2>
            {conflicts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">⚡</div>
                <h3>{lang === "fr" ? "Aucune contradiction détectée" : "No conflicts detected"}</h3>
                <p>{t("empty.conflicts")}</p>
              </div>
            ) : (
              conflicts.map((c) => (
                <div key={c.id} className="card mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`badge badge-${c.status === "DETECTED" ? "warning" : "completed"}`}
                    >
                      {c.status === "DETECTED"
                        ? lang === "fr"
                          ? "Détecté"
                          : "Detected"
                        : lang === "fr"
                          ? "Résolu"
                          : "Resolved"}
                    </span>
                    <h4>{c.title}</h4>
                  </div>
                  <p className="mb-4">{c.description}</p>
                  {c.status === "DETECTED" && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">Options:</h4>
                      {c.options.map((opt) => (
                        <div
                          key={opt.id}
                          className="card mb-2"
                          style={{ padding: "var(--space-3)" }}
                        >
                          <h4 className="text-sm">{opt.label}</h4>
                          <p className="text-xs text-muted mb-2">{opt.description}</p>
                          <p className="text-xs" style={{ color: "var(--color-warning)" }}>
                            Impact: {opt.impact}
                          </p>
                          <div className="mt-2">
                            <input
                              className="input"
                              style={{ marginBottom: "var(--space-2)" }}
                              placeholder={
                                lang === "fr"
                                  ? "Justification de ce choix..."
                                  : "Rationale for this choice..."
                              }
                              value={resolveRationale}
                              onChange={(e) => setResolveRationale(e.target.value)}
                            />
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => resolveConflict(c.id, opt.id)}
                            >
                              {lang === "fr" ? "Choisir cette option" : "Choose This Option"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "blueprint" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("tab.blueprint")}</h2>
              <span className="badge badge-demo">
                {lang === "fr" ? "Généré automatiquement par l'IA" : "Generated by AI Demo"}
              </span>
            </div>
            {artifacts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📘</div>
                <h3>{lang === "fr" ? "Aucun blueprint généré" : "No blueprint yet"}</h3>
                <p>{t("empty.blueprint")}</p>
              </div>
            ) : (
              artifacts.map((a) => (
                <details key={a.id} className="card mb-4">
                  <summary className="flex items-center gap-3" style={{ cursor: "pointer" }}>
                    <span className={`badge badge-${a.status.toLowerCase()}`}>
                      {a.status === "DRAFT"
                        ? lang === "fr"
                          ? "Brouillon"
                          : "Draft"
                        : lang === "fr"
                          ? "Approuvé"
                          : "Approved"}
                    </span>
                    <h4>{a.title}</h4>
                    <span className="text-xs text-muted">{a.section}</span>
                    {a.status === "DRAFT" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginLeft: "auto", color: "var(--color-primary)" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          await handleApproveArtifact(a.id);
                        }}
                      >
                        ✔️ {lang === "fr" ? "Approuver" : "Approve"}
                      </button>
                    )}
                  </summary>
                  <div className="mt-4" style={{ whiteSpace: "pre-wrap" }}>
                    {(() => {
                      try {
                        const p = JSON.parse(a.content);
                        return p.sections ? (
                          p.sections.map((s: { heading: string; body: string }, i: number) => (
                            <div key={i} className="mb-3">
                              <h4 className="text-sm font-semibold">{s.heading}</h4>
                              <p className="text-sm">{s.body}</p>
                            </div>
                          ))
                        ) : (
                          <pre className="text-sm">{JSON.stringify(p, null, 2)}</pre>
                        );
                      } catch {
                        return <p className="text-sm">{a.content}</p>;
                      }
                    })()}
                  </div>
                </details>
              ))
            )}
          </div>
        )}

        {activeTab === "audits" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("tab.audits")}</h2>
              <button
                className="btn btn-primary"
                onClick={runAudits}
                disabled={
                  isAuditing || missions.length === 0 || missions[0]!.status !== "COMPLETED"
                }
              >
                {isAuditing ? (
                  <>
                    <div
                      className="loading-spinner"
                      style={{ width: 14, height: 14, borderWidth: 2 }}
                    />{" "}
                    {t("action.loading")}
                  </>
                ) : (
                  `🔍 ${lang === "fr" ? "Lancer les audits" : "Run Audits"}`
                )}
              </button>
            </div>
            {gates.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3">{lang === "fr" ? "Portes de validation" : "Gates"}</h3>
                {gates.map((g) => (
                  <div key={g.id} className="card mb-2" style={{ padding: "var(--space-3)" }}>
                    <div className="flex items-center gap-3">
                      <span className={`badge badge-${g.status.toLowerCase()}`}>
                        {g.status === "PASSED"
                          ? lang === "fr"
                            ? "Réussie"
                            : "Passed"
                          : lang === "fr"
                            ? "Bloquée"
                            : "Blocked"}
                      </span>
                      <span className="font-semibold">{g.name}</span>
                      {g.blocking && (
                        <span className="badge badge-blocking">
                          {lang === "fr" ? "Bloquant" : "Blocking"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {findings.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <h3>{lang === "fr" ? "Aucun constat" : "No findings yet"}</h3>
                <p>{t("empty.audits")}</p>
              </div>
            ) : (
              findings.map((f) => (
                <div key={f.id} className="card mb-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`badge badge-${f.severity.toLowerCase()}`}>
                      {f.severity === "BLOCKING"
                        ? lang === "fr"
                          ? "Bloquant"
                          : "Blocking"
                        : f.severity === "WARNING"
                          ? lang === "fr"
                            ? "Avertissement"
                            : "Warning"
                          : "Info"}
                    </span>
                    <h4 className="text-sm">{f.title}</h4>
                    <span className="badge badge-info">{f.auditType}</span>
                  </div>
                  <p className="text-sm mb-1">{f.description}</p>
                  <p className="text-xs text-muted">
                    {lang === "fr" ? "Correction : " : "Correction: "}
                    {f.correction}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "baseline" && (
          <div>
            {(() => {
              const hasDraftArtifacts = artifacts.some((a) => a.status === "DRAFT");
              const hasBlockingGates = gates.some((g) => g.blocking && g.status === "BLOCKED");

              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2>{t("tab.baseline")}</h2>
                    <button
                      className="btn btn-primary"
                      onClick={freezeBaseline}
                      disabled={
                        isFreezing || gates.length === 0 || hasBlockingGates || hasDraftArtifacts
                      }
                    >
                      {isFreezing ? (
                        <>
                          <div
                            className="loading-spinner"
                            style={{ width: 14, height: 14, borderWidth: 2 }}
                          />{" "}
                          {t("action.loading")}
                        </>
                      ) : (
                        `📌 ${t("baseline.freezeBtn")}`
                      )}
                    </button>
                  </div>

                  {hasBlockingGates && (
                    <div
                      className="card mb-4"
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        color: "rgb(239,68,68)",
                      }}
                    >
                      <p className="text-sm font-semibold">{t("baseline.blockedMsg")}</p>
                    </div>
                  )}

                  {hasDraftArtifacts && (
                    <div
                      className="card mb-4"
                      style={{
                        background: "rgba(234,179,8,0.1)",
                        border: "1px solid rgba(234,179,8,0.2)",
                        color: "rgb(234,179,8)",
                      }}
                    >
                      <p className="text-sm font-semibold">{t("baseline.draftBlockedMsg")}</p>
                    </div>
                  )}

                  {baselines.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📌</div>
                      <h3>{lang === "fr" ? "Aucune baseline gelée" : "No baseline yet"}</h3>
                      <p>{t("empty.baseline")}</p>
                    </div>
                  ) : (
                    baselines.map((b) => (
                      <div key={b.id} className="card mb-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span
                            className={`badge badge-${b.status === "FROZEN" ? "locked" : "draft"}`}
                          >
                            {b.status === "FROZEN"
                              ? lang === "fr"
                                ? "Gelée"
                                : "Frozen"
                              : b.status}
                          </span>
                          <h4>{b.name}</h4>
                        </div>
                        <p className="text-sm text-muted">
                          {lang === "fr" ? "Gelé le : " : "Frozen at: "}
                          {new Date(b.frozenAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-muted">
                          {t("baseline.details")
                            .replace("{art}", b.artifactIds.length.toString())
                            .replace("{gates}", b.gateIds.length.toString())}
                        </p>
                      </div>
                    ))
                  )}
                </>
              );
            })()}
          </div>
        )}

        {activeTab === "package" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("tab.package")}</h2>
              <div className="flex gap-3">
                <button
                  className="btn btn-primary"
                  onClick={generatePackage}
                  disabled={isGenerating || baselines.length === 0}
                >
                  {isGenerating ? (
                    <>
                      <div
                        className="loading-spinner"
                        style={{ width: 14, height: 14, borderWidth: 2 }}
                      />{" "}
                      {t("action.loading")}
                    </>
                  ) : (
                    `📦 ${t("package.generateBtn")}`
                  )}
                </button>
                {pkg && (
                  <button className="btn btn-secondary" onClick={downloadPackage}>
                    {t("package.downloadBtn")}
                  </button>
                )}
              </div>
            </div>
            {!pkg ? (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <h3>{lang === "fr" ? "Aucun paquet généré" : "No package yet"}</h3>
                <p>{t("empty.package")}</p>
              </div>
            ) : (
              <div>
                <div className="card mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`badge badge-${pkg.status.toLowerCase()}`}>
                      {pkg.status === "READY" ? (lang === "fr" ? "Prêt" : "Ready") : pkg.status}
                    </span>
                    <h4>{lang === "fr" ? "Paquet de livraison" : "Execution Package"}</h4>
                  </div>
                  <p className="text-sm text-muted">
                    {lang === "fr" ? "Fichiers : " : "Files: "}
                    {pkg.files.length} | {lang === "fr" ? "Généré le : " : "Generated: "}
                    {new Date(pkg.generatedAt).toLocaleString()}
                  </p>
                </div>
                <h3 className="mb-4">{t("package.files")}</h3>
                {pkg.files.map((f, i) => (
                  <details key={i} className="card mb-2">
                    <summary
                      style={{ cursor: "pointer" }}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm font-semibold">{f.filename}</span>
                      <span className="text-xs text-muted">
                        {(f.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </summary>
                    <pre
                      className="text-xs mt-3"
                      style={{
                        whiteSpace: "pre-wrap",
                        maxHeight: 300,
                        overflow: "auto",
                        background: "var(--color-neutral-800)",
                        padding: "var(--space-3)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--color-neutral-200)",
                      }}
                    >
                      {f.content}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div>
            <h2 className="mb-4">{t("tab.settings")}</h2>
            <div className="card">
              <p className="text-sm">
                <strong>ID:</strong> {project.id}
              </p>
              <p className="text-sm">
                <strong>{lang === "fr" ? "Créé le : " : "Created: "}</strong>{" "}
                {new Date(project.createdAt).toLocaleString()}
              </p>
              <p className="text-sm">
                <strong>{lang === "fr" ? "Mis à jour le : " : "Updated: "}</strong>{" "}
                {new Date(project.updatedAt).toLocaleString()}
              </p>
              <p className="text-sm">
                <strong>{lang === "fr" ? "Version : " : "Version: "}</strong> {project.version}
              </p>
              <p className="text-sm">
                <strong>{lang === "fr" ? "Statut : " : "Status: "}</strong>{" "}
                {project.status === "ACTIVE"
                  ? lang === "fr"
                    ? "Actif"
                    : "Active"
                  : project.status === "ARCHIVED"
                    ? lang === "fr"
                      ? "Archivé"
                      : "Archived"
                    : project.status}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}

      {/* Export Modal */}
      <ExportAnalysisModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        projectId={projectId as EntityId}
        projectTitle={project?.name || (project as any)?.title}
        showToast={(msg) => showToast("info", msg)}
      />

      {/* Modal Nouvelle Variation */}
      {isVariationModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface p-6 rounded-lg max-w-md w-full border border-border shadow-xl space-y-4">
            <h3 className="text-lg font-bold">Générer une nouvelle variation</h3>
            <p className="text-sm text-muted">
              L’IA cherchera de nouvelles propositions différentes de celles déjà générées pour cette couche. Les propositions actuelles seront conservées.
            </p>
            <div className="bg-muted p-3 rounded-md text-xs space-y-1">
              <div><span className="font-semibold">Couche :</span> {selectedLayer}</div>
              <div><span className="font-semibold">Propositions existantes conservées :</span> {currentLayerProposals.length}</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Angle à explorer (optionnel)</label>
              <input
                type="text"
                className="input w-full"
                placeholder="Exemple : simplicité, automatisation, usage hors ligne, accessibilité…"
                value={userDiversityFocus}
                onChange={(e) => setUserDiversityFocus(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setIsVariationModalOpen(false);
                  setUserDiversityFocus("");
                }}
              >
                Annuler
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={isGenerating}
                onClick={() => executeGeneration('VARIATION', userDiversityFocus)}
              >
                {isGenerating ? '⏳ Génération…' : '✨ Générer une nouvelle variation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Résumé de Génération */}
      {generationSummaryModal && generationSummaryModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface p-6 rounded-lg max-w-md w-full border border-border shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-green-700 dark:text-green-400">{generationSummaryModal.title}</h3>
            {generationSummaryModal.addedCount === 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-md text-sm">
                Aucune proposition suffisamment différente n’a été trouvée. Essayez un angle d’exploration plus précis.
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {generationSummaryModal.diversityFocus && (
                  <div className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 p-2 rounded">
                    🎯 <strong>Angle d&apos;exploration :</strong> {generationSummaryModal.diversityFocus}
                  </div>
                )}
                <ul className="divide-y divide-border border rounded-md text-xs">
                  <li className="p-2 flex justify-between"><span>Propositions reçues :</span><span className="font-bold">{generationSummaryModal.receivedCount}</span></li>
                  <li className="p-2 flex justify-between text-green-700 dark:text-green-400"><span>Nouvelles propositions ajoutées :</span><span className="font-bold">+{generationSummaryModal.addedCount}</span></li>
                  <li className="p-2 flex justify-between text-amber-700 dark:text-amber-400"><span>Doublons écartés :</span><span className="font-bold">{generationSummaryModal.duplicateCount}</span></li>
                  <li className="p-2 flex justify-between text-gray-500"><span>Propositions invalides écartées :</span><span className="font-bold">{generationSummaryModal.invalidCount}</span></li>
                  <li className="p-2 flex justify-between font-bold border-t"><span>Propositions à examiner :</span><span>{generationSummaryModal.toReviewCount}</span></li>
                </ul>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setGenerationSummaryModal(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Chargement...</span>
      </div>
    }>
      <ProjectDetailPageContent />
    </Suspense>
  );
}
