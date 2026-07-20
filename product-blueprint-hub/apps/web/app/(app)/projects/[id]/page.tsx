"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
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
} from "@/services";
import { useTranslation } from "@/i18n";

type TabId =
  | "sources"
  | "brief"
  | "decisions"
  | "organization"
  | "control"
  | "conflicts"
  | "blueprint"
  | "audits"
  | "baseline"
  | "package"
  | "settings";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const svc = useServices();
  const { t, lang } = useTranslation();

  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("sources");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockConfirmItem, setLockConfirmItem] = useState<BriefItem | null>(null);

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

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const p = await svc.projects.getProject(projectId as EntityId);
      if (!p) {
        setError("Project not found");
        return;
      }
      setProject(p);
      const [src, brief, dec, conf, mis] = await Promise.all([
        svc.sources.getSources(projectId as EntityId),
        svc.brief.getBriefItems(projectId as EntityId),
        svc.decisions.getDecisions(projectId as EntityId),
        svc.conflicts.getConflicts(projectId as EntityId),
        svc.missions.getMissions(projectId as EntityId),
      ]);
      setSources(src);
      setBriefItems(brief);
      setDecisions(dec);
      setConflicts(conf);
      setMissions(mis);

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
      setActiveTab("brief");
      load();
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBriefAction = async (
    itemId: string,
    action: "accept" | "correct" | "reject" | "lock",
  ) => {
    try {
      if (action === "accept") await svc.brief.acceptItem(itemId as EntityId);
      else if (action === "reject") await svc.brief.rejectItem(itemId as EntityId);
      else if (action === "lock") await svc.brief.lockItem(itemId as EntityId);
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
        else if (action === "lock") msg = t("lock.success");
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
      setActiveTab("organization");
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

  const runMission = async () => {
    console.log("runMission: Start clicked, missions length:", missions.length);
    if (missions.length === 0) return;
    setIsRunning(true);
    try {
      console.log("runMission: Calling executeMission for", missions[0]!.id);
      await svc.missions.executeMission(missions[0]!.id, {
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
      console.log("runMission: executeMission completed successfully");
      showToast("success", lang === "fr" ? "Mission terminée" : "Mission completed");
      setActiveTab("control");
      console.log("runMission: calling load()");
      await load();
      console.log("runMission: load() completed");
    } catch (err) {
      console.error("ERROR IN runMission:", err);
      showToast("error", String(err));
    } finally {
      setIsRunning(false);
      console.log("runMission: finished, isRunning set to false");
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
      setActiveTab("audits");
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
      setActiveTab("baseline");
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
      setActiveTab("package");
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

      <div className="page-content">
        {/* Tabs */}
        <div className="tabs" style={{ overflowX: "auto" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${activeTab === t.id ? "tab-active" : ""}`}
              onClick={() => setActiveTab(t.id)}
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
            <div className="flex items-center justify-between mb-4">
              <h2>
                {lang === "fr" ? "Compréhension du Brief" : "Brief — What the Hub Understood"}
              </h2>
              <span className="badge badge-demo">AI Demo</span>
            </div>
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
                {briefItems.map((item) => (
                  <div key={item.id} className="card mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`badge badge-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                      <span className="badge badge-info">{item.type}</span>
                      <span className="text-xs text-muted">
                        {lang === "fr" ? "Confiance : " : "Confidence: "}
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </div>
                    <p className="font-semibold mb-2">{item.statement}</p>
                    {item.excerpt && (
                      <p className="text-xs text-muted mb-3">
                        Source: &quot;{item.excerpt.slice(0, 100)}...&quot;
                      </p>
                    )}

                    {item.status !== "LOCKED" && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleBriefAction(item.id, "accept")}
                          disabled={item.status === "ACCEPTED"}
                        >
                          ✅ {t("action.accept")}
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleBriefAction(item.id, "reject")}
                        >
                          ❌ {t("action.reject")}
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => setLockConfirmItem(item)}
                          disabled={item.status !== "ACCEPTED" && item.status !== "CORRECTED"}
                        >
                          🔒 {t("action.lock")}
                        </button>
                      </div>
                    )}
                    {item.status === "LOCKED" && (
                      <span className="text-xs text-muted">
                        🔒{" "}
                        {lang === "fr"
                          ? "Cet élément est verrouillé. Il sert de référence pour la conception."
                          : "This item is locked. It serves as reference for design."}
                      </span>
                    )}

                    {/* Correction */}
                    {item.status !== "LOCKED" && (
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
                    )}

                    {/* Version history */}
                    {item.previousVersions.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-muted" style={{ cursor: "pointer" }}>
                          {lang === "fr"
                            ? `Historique des versions (${item.previousVersions.length})`
                            : `Version history (${item.previousVersions.length})`}
                        </summary>
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
                ))}
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

        {activeTab === "organization" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2>{t("org.title")}</h2>
              {missions.length > 0 && missions[0]!.status === "PLANNED" && (
                <button className="btn btn-primary" onClick={runMission} disabled={isRunning}>
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

            {missions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏗️</div>
                <h3>{lang === "fr" ? "Aucune mission planifiée" : "No mission planned"}</h3>
                <p>{t("empty.organization")}</p>
                {briefItems.length > 0 && (
                  <button className="btn btn-primary mt-4" onClick={() => setActiveTab("brief")}>
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
              {missions.length > 0 && missions[0]!.status !== "PLANNED" && missions[0]!.status !== "RUNNING" && (
                <button className="btn btn-secondary" onClick={downloadDiagnosticJson}>
                  ⬇️ {lang === "fr" ? "Télécharger le diagnostic JSON" : "Download JSON Diagnostic"}
                </button>
              )}
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
                    {lang === "fr" ? "Apples : " : "Calls: "}
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
                        <span className={`badge badge-${t.status.toLowerCase()}`}>
                          {lang === "fr"
                            ? t.status === "COMPLETED"
                              ? "Terminée"
                              : t.status === "PENDING"
                                ? "En attente"
                                : t.status
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

      {/* Brief Lock Confirmation Modal */}
      {lockConfirmItem && (
        <div className="modal-overlay" onClick={() => setLockConfirmItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t("lock.confirm.title")}</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: "var(--space-3)" }}>{t("lock.confirm.desc")}</p>
              <div
                className="card text-sm"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderLeft: "4px solid var(--color-primary-500)",
                  padding: "var(--space-3)",
                }}
              >
                <strong>[{lockConfirmItem.type}]</strong> {lockConfirmItem.statement}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setLockConfirmItem(null)}>
                {t("action.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const id = lockConfirmItem.id;
                  setLockConfirmItem(null);
                  await handleBriefAction(id, "lock");
                }}
              >
                {t("action.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}
    </>
  );
}
