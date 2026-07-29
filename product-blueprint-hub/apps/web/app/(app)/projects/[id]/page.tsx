"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
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
  type DesignBaselineSummary,
  type PlatformConsistencyReport,
  computePlatformConsistency,
} from "@/services";
import { useTranslation } from "@/i18n";
import { ExportAnalysisModal } from "@/components/ExportAnalysisModal";

type TabId =
  | "sources"
  | "brief"
  | "decisions"
  | "interview"
  | "organization"
  | "control"
  | "conflicts"
  | "blueprint"
  | "audits"
  | "baseline"
  | "package"
  | "settings";



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
  const validTabs: TabId[] = ["sources", "brief", "decisions", "interview", "organization", "control", "conflicts", "blueprint", "audits", "baseline", "package", "settings"];
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
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [selectedPlatformChoice, setSelectedPlatformChoice] = useState<'ANDROID_EXPO' | 'WEB_NEXTJS' | null>(null);
  const [isConfirmingPlatform, setIsConfirmingPlatform] = useState(false);

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const [baselineSummary, setBaselineSummary] = useState<DesignBaselineSummary | null>(null);

  // Product Interview states
  const [piSession, setPiSession] = useState<import("@pbh/domain").ProductInterviewSession | null>(null);
  const [piBlueprint, setPiBlueprint] = useState<import("@pbh/domain").FunctionalBlueprint | null>(null);
  const [piAssertions, setPiAssertions] = useState<import("@pbh/domain").KnowledgeAssertion[]>([]);
  const [piMessages, setPiMessages] = useState<import("@pbh/domain").ProductInterviewMessage[]>([]);
  const [piContradictions, setPiContradictions] = useState<import("@pbh/domain").ProductInterviewContradiction[]>([]);
  const [isInitializingInterview, setIsInitializingInterview] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const p = await svc.projects.getProject(projectId as EntityId);
      if (!p) {
        setError("Project not found");
        return;
      }
      setProject(p);
      const [src, brief, dec, conf, mis, bSummary, piSess] = await Promise.all([
        svc.sources.getSources(projectId as EntityId),
        svc.brief.getBriefItems(projectId as EntityId),
        svc.decisions.getDecisions(projectId as EntityId),
        svc.conflicts.getConflicts(projectId as EntityId),
        svc.missions.getMissions(projectId as EntityId),
        svc.designWorkshop.getDesignBaselineSummary(projectId as EntityId),
        svc.productInterview.getSession(projectId as EntityId),
      ]);
      setSources(src);
      setBriefItems(brief);
      setDecisions(dec);
      setConflicts(conf);
      setMissions(mis);
      setBaselineSummary(bSummary);
      setPiSession(piSess);

      if (piSess) {
        const [bp, ass, msg, ctr] = await Promise.all([
          svc.productInterview.getBlueprint(projectId as EntityId),
          svc.productInterview.getAssertions(piSess.id),
          svc.productInterview.getMessages(piSess.id),
          svc.productInterview.getContradictions(piSess.id),
        ]);
        setPiBlueprint(bp);
        setPiAssertions(ass);
        setPiMessages(msg);
        setPiContradictions(ctr);
      }

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

  const platformReport: PlatformConsistencyReport = useMemo(() => {
    return computePlatformConsistency(project, []);
  }, [project]);

  const handleStartInterview = async () => {
    setIsInitializingInterview(true);
    try {
      const { session, blueprint } = await svc.productInterview.initSession(projectId as EntityId);
      setPiSession(session);
      setPiBlueprint(blueprint);
      const [ass, msg, ctr] = await Promise.all([
        svc.productInterview.getAssertions(session.id),
        svc.productInterview.getMessages(session.id),
        svc.productInterview.getContradictions(session.id),
      ]);
      setPiAssertions(ass);
      setPiMessages(msg);
      setPiContradictions(ctr);
      showToast("success", "Entretien Produit initialisé avec succès !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsInitializingInterview(false);
    }
  };

  const handleFreezeDesignBaseline = async () => {
    if (!window.confirm("Geler la baseline de conception ? Les propositions acceptées seront scellées comme référence pour la mission.")) return;
    setIsFreezing(true);
    try {
      await svc.designWorkshop.freezeBaseline(projectId as EntityId, "v1", "User");
      showToast("success", "Conception validée avec succès ! La mission peut maintenant être lancée dans l'onglet Organisation.");
      await load();
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsFreezing(false);
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
    { id: "decisions", label: `⚖️ ${t("tab.decisions")}`, count: decisions.length },
    { id: "interview", label: "🧭 Entretien Produit", count: piSession ? piSession.questionCount : 0 },
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
          {/* Platform Consistency Badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.7rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: platformReport.status !== 'CONFIRMED' ? 'pointer' : 'default',
              backgroundColor:
                platformReport.status === 'CONFIRMED' ? 'rgba(16,185,129,0.15)' :
                platformReport.status === 'MISSING' ? 'rgba(245,158,11,0.15)' :
                'rgba(239,68,68,0.15)',
              color:
                platformReport.status === 'CONFIRMED' ? '#10b981' :
                platformReport.status === 'MISSING' ? '#f59e0b' :
                '#ef4444',
              border: `1px solid ${
                platformReport.status === 'CONFIRMED' ? 'rgba(16,185,129,0.4)' :
                platformReport.status === 'MISSING' ? 'rgba(245,158,11,0.4)' :
                'rgba(239,68,68,0.4)'
              }`,
            }}
            onClick={() => {
              if (platformReport.status !== 'CONFIRMED') {
                setSelectedPlatformChoice(platformReport.canonicalPlatform === 'ANDROID_EXPO' ? 'ANDROID_EXPO' : 'WEB_NEXTJS');
                setIsPlatformModalOpen(true);
              }
            }}
            title={
              platformReport.status !== 'CONFIRMED'
                ? `${platformReport.recommendation}\n(Cliquer pour résoudre et confirmer la plateforme)`
                : platformReport.recommendation
            }
          >
            {platformReport.status === 'CONFIRMED' ? '✅' : platformReport.status === 'MISSING' ? '⚠️' : '🔴'}
            {' '}
            {platformReport.canonicalPlatform === 'ANDROID_EXPO' ? '📱 Mobile' :
             platformReport.canonicalPlatform === 'WEB_NEXTJS' ? '🌐 Web' :
             lang === 'fr' ? 'Plateforme non définie' : 'No platform'}
            {platformReport.status === 'CONTRADICTORY' && ` (${platformReport.incompatibleCount} contradiction${platformReport.incompatibleCount > 1 ? 's' : ''})`}
            {platformReport.status !== 'CONFIRMED' && (
              <span style={{ marginLeft: '0.2rem', textDecoration: 'underline', fontSize: '0.7rem', opacity: 0.9 }}>
                ⚙️ Résoudre
              </span>
            )}
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

        {activeTab === "interview" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2>🧭 Entretien Produit</h2>
                <p className="text-sm text-muted">
                  Transformez une idée brute en une vision produit claire, explicite et traçable (basé sur <em>L’Architecture de la Pensée Produit</em>).
                </p>
              </div>
              {piSession && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => showToast("info", "Les fondations de l'entretien sont prêtes. Le dialogue intelligent sera activé au prochain chantier.")}
                >
                  ▶️ Reprendre l&apos;entretien
                </button>
              )}
            </div>

            {!piSession ? (
              <div className="card p-6 text-center space-y-4">
                <div className="text-4xl mb-2">🧭</div>
                <h3 className="text-lg font-bold">Aucun entretien produit démarré</h3>
                <p className="text-sm text-muted max-w-xl mx-auto">
                  L&apos;entretien produit vous guidera pas à pas pour formaliser le problème réel, la promesse minimale, la boucle de valeur et les 14 sections du blueprint avant l&apos;exécution des 18 agents.
                </p>
                <div className="pt-2">
                  <button
                    className="btn btn-primary"
                    onClick={handleStartInterview}
                    disabled={isInitializingInterview}
                  >
                    {isInitializingInterview ? "⏳ Initialisation..." : "🚀 Commencer l'entretien"}
                  </button>
                </div>
                <p className="text-xs text-muted pt-2 italic">
                  Les fondations de l&apos;entretien sont prêtes. Le dialogue intelligent sera activé au prochain chantier.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Information Banner */}
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-semibold flex items-center gap-2">
                      <span>📌 Statut : <strong>{piSession.status}</strong></span>
                      <span className="badge badge-info">{piSession.maturityStep}</span>
                    </div>
                    <p className="text-xs text-muted">
                      Les fondations de l&apos;entretien sont prêtes. Le dialogue intelligent sera activé au prochain chantier.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleStartInterview}
                    disabled={isInitializingInterview}
                  >
                    🔄 Réinitialiser
                  </button>
                </div>

                {/* Stat Counters */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="card p-3 text-center">
                    <span className="text-xs text-muted block">🗣️ Messages</span>
                    <strong className="text-lg block mt-1">{piMessages.length}</strong>
                  </div>
                  <div className="card p-3 text-center">
                    <span className="text-xs text-muted block">✅ Confirmés</span>
                    <strong className="text-lg block mt-1 text-green-500">
                      {piAssertions.filter((a) => a.status === "CONFIRMED").length}
                    </strong>
                  </div>
                  <div className="card p-3 text-center">
                    <span className="text-xs text-muted block">💡 Hypothèses</span>
                    <strong className="text-lg block mt-1 text-amber-500">
                      {piAssertions.filter((a) => a.status === "INFERRED").length}
                    </strong>
                  </div>
                  <div className="card p-3 text-center">
                    <span className="text-xs text-muted block">❓ Inconnues Bloquantes</span>
                    <strong className="text-lg block mt-1 text-red-500">{piSession.blockingUnknownsCount}</strong>
                  </div>
                  <div className="card p-3 text-center">
                    <span className="text-xs text-muted block">⚡ Contradictions</span>
                    <strong className="text-lg block mt-1">{piSession.openContradictionsCount}</strong>
                  </div>
                </div>

                {/* 14 Blueprint Sections */}
                <div>
                  <h3 className="text-md font-bold mb-3">📘 Blueprint Fonctionnel (14 Sections)</h3>
                  {piBlueprint ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.values(piBlueprint.sections).map((sec) => (
                        <div key={sec.id} className="card p-4 space-y-2 border border-border">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm">{sec.title}</h4>
                            <span
                              className={`badge text-xs ${
                                sec.status === "CONFIRMED"
                                  ? "badge-success"
                                  : sec.status === "TO_CONFIRM" || sec.status === "INFERRED"
                                  ? "badge-warning"
                                  : "badge-secondary"
                              }`}
                            >
                              {sec.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted">
                            {sec.summary || "Section encore non renseignée."}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted">Chargement du blueprint...</div>
                  )}
                </div>
              </div>
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



      {/* Modal de Résolution de Plateforme Cible */}
      {isPlatformModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-bg-surface, #ffffff)",
              color: "var(--color-text-main, #1e293b)",
              borderRadius: "0.75rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.5rem",
              border: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚙️ Résolution de la plateforme cible
              </h3>
              <button
                onClick={() => setIsPlatformModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
              {/* Diagnostic actuel */}
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: platformReport.status === 'CONTRADICTORY' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)', border: `1px solid ${platformReport.status === 'CONTRADICTORY' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}` }}>
                <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: platformReport.status === 'CONTRADICTORY' ? '#dc2626' : '#d97706' }}>
                  Diagnostic : {platformReport.status === 'CONTRADICTORY' ? 'Contradictions de plateforme détectées' : 'Plateforme cible non définie'}
                </div>
                <p style={{ margin: 0, color: '#475569' }}>
                  Plateforme actuellement enregistrée : <strong>{platformReport.canonicalPlatform === 'ANDROID_EXPO' ? 'Application Mobile (ANDROID_EXPO)' : platformReport.canonicalPlatform === 'WEB_NEXTJS' ? 'Application Web (WEB_NEXTJS)' : 'Non définie'}</strong>
                </p>

                {platformReport.conflictingSources.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#334155' }}>Sources de contradiction ({platformReport.conflictingSources.length}) :</div>
                    <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0, fontSize: '0.8rem', color: '#475569' }}>
                      {platformReport.conflictingSources.map((cs, idx) => (
                        <li key={idx} style={{ marginBottom: '0.2rem' }}>
                          {cs.reason || cs.declaredPlatform}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {platformReport.incompatibleCount > 0 && (
                  <div style={{ marginTop: '0.5rem', fontWeight: 600, color: '#dc2626', fontSize: '0.8rem' }}>
                    ⚠️ {platformReport.incompatibleCount} proposition(s) existante(s) déclarent une plateforme différente.
                  </div>
                )}
              </div>

              {/* Sélection explicite de la plateforme */}
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                  Choisissez la plateforme d&apos;autorité pour ce projet :
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div
                    onClick={() => setSelectedPlatformChoice('ANDROID_EXPO')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '0.5rem',
                      border: `2px solid ${selectedPlatformChoice === 'ANDROID_EXPO' ? '#2563eb' : '#e2e8f0'}`,
                      backgroundColor: selectedPlatformChoice === 'ANDROID_EXPO' ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      📱 Mobile (Android / Expo)
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                      React Native & Expo pour smartphone Android.
                    </p>
                  </div>

                  <div
                    onClick={() => setSelectedPlatformChoice('WEB_NEXTJS')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '0.5rem',
                      border: `2px solid ${selectedPlatformChoice === 'WEB_NEXTJS' ? '#2563eb' : '#e2e8f0'}`,
                      backgroundColor: selectedPlatformChoice === 'WEB_NEXTJS' ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      🌐 Web (React / Next.js)
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                      Application exécutée dans un navigateur web.
                    </p>
                  </div>
                </div>
              </div>

              {/* Explication non-destructive */}
              <div style={{ padding: '0.65rem', borderRadius: '0.375rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#64748b' }}>
                ℹ️ <strong>Conservation des données :</strong> La confirmation n&apos;efface et ne réécrit aucune proposition existante. Les propositions incompatibles resteront visibles et conservées sans perte.
              </div>

              {/* Actions de confirmation */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsPlatformModalOpen(false)}
                  disabled={isConfirmingPlatform}
                >
                  Annuler
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!selectedPlatformChoice || isConfirmingPlatform}
                  onClick={async () => {
                    if (!selectedPlatformChoice || !project) return;
                    setIsConfirmingPlatform(true);
                    try {
                      await svc.projects.confirmTargetPlatform(project.id, selectedPlatformChoice);
                      showToast('success', `Plateforme canonique confirmée avec succès : ${selectedPlatformChoice === 'ANDROID_EXPO' ? 'Application Mobile (Expo)' : 'Application Web (Next.js)'}`);
                      setIsPlatformModalOpen(false);
                      await load();
                    } catch (err) {
                      showToast('error', `Échec de la confirmation : ${String(err)}`);
                    } finally {
                      setIsConfirmingPlatform(false);
                    }
                  }}
                >
                  {isConfirmingPlatform ? 'Enregistrement...' : 'Confirmer la plateforme'}
                </button>
              </div>
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
