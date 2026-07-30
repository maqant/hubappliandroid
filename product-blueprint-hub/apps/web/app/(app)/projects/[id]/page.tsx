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
import { STATUS_LABELS_FR, SOURCE_LABELS_FR } from "@pbh/domain";
import { useTranslation } from "@/i18n";
import { ExportAnalysisModal } from "@/components/ExportAnalysisModal";

type TabId =
  | "interview"
  | "organization"
  | "control"
  | "blueprint"
  | "delivery"
  | "settings";

type DeliverySubTab = "audits" | "baseline" | "conflicts" | "package";

export function ProjectDetailPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const projectId = params.id as string;
  const svc = useServices();
  const router = useRouter();
  const { t, lang } = useTranslation();

  const [project, setProject] = useState<Project | null>(null);
  
  const rawTab = searchParams.get("tab") as string | null;
  const rawSub = searchParams.get("sub") as DeliverySubTab | null;
  const validTabs: TabId[] = ["interview", "organization", "control", "blueprint", "delivery", "settings"];
  const activeTab: TabId = rawTab && (validTabs as string[]).includes(rawTab) ? (rawTab as TabId) : "interview";
  const activeDeliverySub: DeliverySubTab = rawSub && ["audits", "baseline", "conflicts", "package"].includes(rawSub) ? rawSub : "audits";

  // Redirections transparentes des URL legacy vers la navigation 5 phases
  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (!currentTab) return;

    if (currentTab === "decisions" || currentTab === "decision" || currentTab === "arbitrations") {
      router.replace(`${pathname}?tab=interview&view=blueprint&panel=decisions`, { scroll: false });
    } else if (currentTab === "sources") {
      router.replace(`${pathname}?tab=interview&context=open`, { scroll: false });
    } else if (currentTab === "brief" || currentTab === "understanding" || currentTab === "comprehension") {
      router.replace(`${pathname}?tab=interview&view=blueprint`, { scroll: false });
    } else if (currentTab === "conflicts") {
      router.replace(`${pathname}?tab=delivery&sub=conflicts`, { scroll: false });
    } else if (currentTab === "audits") {
      router.replace(`${pathname}?tab=delivery&sub=audits`, { scroll: false });
    } else if (currentTab === "baseline") {
      router.replace(`${pathname}?tab=delivery&sub=baseline`, { scroll: false });
    } else if (currentTab === "package") {
      router.replace(`${pathname}?tab=delivery&sub=package`, { scroll: false });
    }
  }, [searchParams, pathname, router]);

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
  const [piConsequences, setPiConsequences] = useState<import("@pbh/domain").ProposedConsequence[]>([]);
  const [piBaseline, setPiBaseline] = useState<import("@pbh/domain").ProductInterviewBaseline | null>(null);
  const [projectAuthority, setProjectAuthority] = useState<import("@pbh/domain").ProjectProductAuthority | null>(null);
  const [decisionRegister, setDecisionRegister] = useState<readonly import("@pbh/domain").DecisionRegisterEntry[]>([]);
  const [preReviewReadiness, setPreReviewReadiness] = useState<import("@pbh/domain").PreReviewReadiness | null>(null);
  const [orbiteReviewResult, setOrbiteReviewResult] = useState<import("@pbh/domain").OrbiteReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isValidatingBaseline, setIsValidatingBaseline] = useState(false);
  const [viewMode, setViewMode] = useState<"conversation" | "blueprint">("conversation");
  const [showContextPanel, setShowContextPanel] = useState<boolean>(searchParams.get("context") === "open");
  const [showDecisionsPanel, setShowDecisionsPanel] = useState<boolean>(searchParams.get("panel") === "decisions");
  const [newContextLabel, setNewContextLabel] = useState("");
  const [newContextText, setNewContextText] = useState("");
  const [newContextType, setNewContextType] = useState<import("@pbh/domain").SourceType>("TEXT");
  const [showJeNeSaisPasOptions, setShowJeNeSaisPasOptions] = useState(false);
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
      const [src, brief, dec, conf, mis, bSummary, piSess, bsl, auth, dReg] = await Promise.all([
        svc.sources.getSources(projectId as EntityId),
        svc.brief.getBriefItems(projectId as EntityId),
        svc.decisions.getDecisions(projectId as EntityId),
        svc.conflicts.getConflicts(projectId as EntityId),
        svc.missions.getMissions(projectId as EntityId),
        svc.designWorkshop.getDesignBaselineSummary(projectId as EntityId),
        svc.productInterview.getSession(projectId as EntityId),
        svc.productInterview.getLatestBaseline(projectId as EntityId),
        svc.productInterview.resolveAuthority(projectId as EntityId),
        svc.productInterview.getDecisionRegister(projectId as EntityId),
      ]);
      setSources(src);
      setBriefItems(brief);
      setDecisions(dec);
      setConflicts(conf);
      setMissions(mis);
      setBaselineSummary(bSummary);
      setPiSession(piSess);
      setPiBaseline(bsl);
      setProjectAuthority(auth);
      setDecisionRegister(dReg);

      if (piSess) {
        const [bp, ass, msg, ctr, cons] = await Promise.all([
          svc.productInterview.getBlueprint(projectId as EntityId),
          svc.productInterview.getAssertions(piSess.id),
          svc.productInterview.getMessages(piSess.id),
          svc.productInterview.getContradictions(piSess.id),
          svc.productInterview.getProposedConsequences(piSess.id),
        ]);
        setPiBlueprint(bp);
        setPiAssertions(ass);
        setPiMessages(msg);
        setPiContradictions(ctr);
        setPiConsequences(cons);
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

  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [userAnswerInput, setUserAnswerInput] = useState("");
  const [activeQuestion, setActiveQuestion] = useState<any | null>(null);
  const [questionTarget, setQuestionTarget] = useState<any | null>(null);
  const [turnImpactSummary, setTurnImpactSummary] = useState<any | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const handleStartInterview = async () => {
    setIsInitializingInterview(true);
    try {
      const { session, blueprint, isNew } = await svc.productInterview.initSession(projectId as EntityId);
      setPiSession(session);
      setPiBlueprint(blueprint);
      
      // Tour 1 si nouvelle session sans messages
      if (isNew) {
        const turnRes = await svc.productInterview.processTurn(projectId as EntityId);
        setPiSession(turnRes.session);
        setPiBlueprint(turnRes.blueprint);
        setActiveQuestion(turnRes.activeQuestion);
        setQuestionTarget(turnRes.questionTarget);
        if (turnRes.response.turnImpact) {
          setTurnImpactSummary(turnRes.response.turnImpact);
        }
      } else if (session.activeQuestionTarget) {
        setQuestionTarget(session.activeQuestionTarget);
      }

      const [ass, msg, ctr, cons] = await Promise.all([
        svc.productInterview.getAssertions(session.id),
        svc.productInterview.getMessages(session.id),
        svc.productInterview.getContradictions(session.id),
        svc.productInterview.getProposedConsequences(session.id),
      ]);
      setPiAssertions(ass);
      setPiMessages(msg);
      setPiContradictions(ctr);
      setPiConsequences(cons);
      showToast("success", "Entretien Produit démarré avec succès !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsInitializingInterview(false);
    }
  };

  const refreshInterviewData = async (sessionId: EntityId) => {
    const [sess, bp, ass, ctr, cons] = await Promise.all([
      svc.productInterview.getSession(projectId as EntityId),
      svc.productInterview.getBlueprint(projectId as EntityId),
      svc.productInterview.getAssertions(sessionId),
      svc.productInterview.getContradictions(sessionId),
      svc.productInterview.getProposedConsequences(sessionId),
    ]);
    if (sess) setPiSession(sess);
    if (bp) setPiBlueprint(bp);
    setPiAssertions(ass);
    setPiContradictions(ctr);
    setPiConsequences(cons);
  };

  const handleProcessTurn = async (input?: string) => {
    setIsProcessingTurn(true);
    setShowJeNeSaisPasOptions(false);
    try {
      const res = await svc.productInterview.processTurn(projectId as EntityId, input);
      setPiSession(res.session);
      setPiBlueprint(res.blueprint);
      setActiveQuestion(res.activeQuestion);
      setQuestionTarget(res.questionTarget);
      if (res.response.turnImpact) {
        setTurnImpactSummary(res.response.turnImpact);
      }
      const [ass, msg, ctr, cons] = await Promise.all([
        svc.productInterview.getAssertions(res.session.id),
        svc.productInterview.getMessages(res.session.id),
        svc.productInterview.getContradictions(res.session.id),
        svc.productInterview.getProposedConsequences(res.session.id),
      ]);
      setPiAssertions(ass);
      setPiMessages(msg);
      setPiContradictions(ctr);
      setPiConsequences(cons);
      setUserAnswerInput("");
      showToast("success", "Réponse traitée par l'Architecte Produit !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsProcessingTurn(false);
    }
  };

  // ─── Local Pure Arbitrage Handlers (100% Synchronous/Local without AI) ───
  const handleAcceptConsequence = async (consequenceId: EntityId) => {
    try {
      await svc.productInterview.acceptConsequence(consequenceId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Conséquence acceptée et intégrée au Blueprint !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleRejectConsequence = async (consequenceId: EntityId) => {
    try {
      await svc.productInterview.rejectConsequence(consequenceId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Conséquence refusée.");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleDeferConsequence = async (consequenceId: EntityId) => {
    try {
      await svc.productInterview.deferConsequence(consequenceId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Conséquence reportée à la Roadmap.");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleCorrectConsequence = async (consequenceId: EntityId) => {
    const text = window.prompt("Saisissez votre correction pour cette conséquence :");
    if (!text || !text.trim()) return;
    try {
      await svc.productInterview.correctConsequence(consequenceId, text);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Conséquence corrigée et intégrée au Blueprint !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleConfirmAssertion = async (assertionId: EntityId) => {
    try {
      await svc.productInterview.confirmAssertion(assertionId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Information confirmée !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleExcludeAssertion = async (assertionId: EntityId) => {
    try {
      await svc.productInterview.excludeAssertion(assertionId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Information exclue du périmètre.");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleDeferAssertion = async (assertionId: EntityId) => {
    try {
      await svc.productInterview.deferAssertion(assertionId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Information reportée.");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleMarkNotApplicable = async (assertionId: EntityId) => {
    try {
      await svc.productInterview.markNotApplicable(assertionId);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Marqué comme non applicable.");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleCorrectAssertion = async (assertionId: EntityId) => {
    const text = window.prompt("Saisissez votre correction :");
    if (!text || !text.trim()) return;
    try {
      await svc.productInterview.correctAssertion(assertionId, text);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Information corrigée et confirmée !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleResolveContradiction = async (contradictionId: EntityId) => {
    const text = window.prompt("Formulez la décision d'arbitrage pour résoudre cette contradiction :");
    if (!text || !text.trim()) return;
    try {
      await svc.productInterview.resolveContradiction(contradictionId, text);
      if (piSession) await refreshInterviewData(piSession.id);
      showToast("success", "Contradiction résolue !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  // ─── Chantier 5 — Relecture ORBITE & Baseline Handlers ───

  const handleRequestFinalReview = async () => {
    if (!piSession) return;
    setIsReviewing(true);
    try {
      const readiness = await svc.productInterview.checkPreReviewReadiness(piSession.id);
      setPreReviewReadiness(readiness);

      if (!readiness.ready) {
        showToast("error", `Relecture impossible : ${readiness.blockers.map((b) => b.detail).join(" • ")}`);
        return;
      }

      const res = await svc.productInterview.requestFinalReview(piSession.id);
      setOrbiteReviewResult(res);
      showToast("success", "Relecture finale effectuée par le Relecteur ORBITE !");
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRecordFindingDecision = async (
    finding: import("@pbh/domain").ReviewFinding,
    decision: import("@pbh/domain").FindingDecision
  ) => {
    if (!piSession || !orbiteReviewResult) return;
    try {
      const updated = await svc.productInterview.recordFindingDecision(finding, decision);
      setOrbiteReviewResult({
        ...orbiteReviewResult,
        findings: orbiteReviewResult.findings.map((f) => (f.id === updated.id ? updated : f)),
      });
      showToast("success", `Observation arbitrée (${decision}).`);
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleValidateBaseline = async () => {
    if (!piSession) return;
    if (!window.confirm("Valider le Blueprint Fonctionnel et créer la Product Interview Baseline immuable ?")) return;
    setIsValidatingBaseline(true);
    try {
      const bsl = await svc.productInterview.validateAndCreateBaseline(piSession.id);
      setPiBaseline(bsl);
      showToast("success", `Product Interview Baseline v${bsl.version} créée avec succès !`);
      load();
    } catch (e: any) {
      showToast("error", e.message || String(e));
    } finally {
      setIsValidatingBaseline(false);
    }
  };

  // ─── Chantier 6 — Handlers Contexte Utilisé ───

  const handleToggleSourceStatus = async (
    sourceId: EntityId,
    currentStatus?: import("@pbh/domain").SourceContextStatus
  ) => {
    const nextStatus: import("@pbh/domain").SourceContextStatus =
      currentStatus === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    try {
      await svc.productInterview.toggleSourceContextStatus(sourceId, nextStatus);
      showToast(
        "success",
        nextStatus === "ACTIVE"
          ? "Source réactivée pour le contexte de l'entretien."
          : "Source désactivée du contexte de l'entretien."
      );
      load();
    } catch (e: any) {
      showToast("error", e.message || String(e));
    }
  };

  const handleAddContextSource = async () => {
    if (!newContextText.trim()) return;
    try {
      await svc.sources.addSource(
        projectId as EntityId,
        newContextType,
        newContextLabel.trim() || "Note de contexte",
        newContextText.trim()
      );
      setNewContextText("");
      setNewContextLabel("");
      showToast("success", "Ce contexte a été ajouté. Il sera pris en compte lors du prochain échange avec l'Architecte Produit.");
      load();
    } catch (e: any) {
      showToast("error", e.message || String(e));
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
    { id: "interview", label: "🧭 1. Entretien Produit", count: piSession ? piSession.questionCount : 0 },
    {
      id: "organization",
      label: `🏗️ 2. ${t("tab.organization")}`,
      count: missions.length > 0 ? missions[0]!.agents.length : 0,
    },
    {
      id: "control",
      label: `🎮 3. ${t("tab.control")}`,
      count: missions.length > 0 ? missions[0]!.tasks.length : 0,
    },
    { id: "blueprint", label: `📐 4. Blueprint technique`, count: artifacts.length },
    { id: "delivery", label: `🚀 5. Validation & Livraison`, count: findings.length + conflicts.length },
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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="m-0">🧭 Entretien Produit — Blueprint Vivant</h2>
                  {projectAuthority && (
                    <span
                      className={`badge font-semibold text-xs px-2.5 py-1 ${
                        projectAuthority.status === "PRODUCT_INTERVIEW_BASELINE"
                          ? "badge-success"
                          : projectAuthority.status === "PRODUCT_INTERVIEW_WORKING_STATE"
                            ? "badge-info"
                            : projectAuthority.status === "LEGACY_BRIEF"
                              ? "badge-warning"
                              : "badge-secondary"
                      }`}
                      title={projectAuthority.reason}
                    >
                      {projectAuthority.status === "PRODUCT_INTERVIEW_BASELINE" && "🏆 Authority: Baseline Validée"}
                      {projectAuthority.status === "PRODUCT_INTERVIEW_WORKING_STATE" && "🧭 Authority: Entretien Actif"}
                      {projectAuthority.status === "LEGACY_BRIEF" && "💡 Authority: Brief Historique"}
                      {projectAuthority.status === "NONE" && "⚪ Nouveaux Projets"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted mt-1">
                  Transformez une idée brute en une vision produit claire, explicite et traçable (basé sur <em>L’Architecture de la Pensée Produit</em>).
                </p>
              </div>
              
              {piSession && (
                <div className="flex items-center gap-2">
                  <div className="bg-surface border border-border p-1 rounded-lg flex items-center gap-1 text-xs">
                    <button
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                        viewMode === "conversation"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                      onClick={() => setViewMode("conversation")}
                    >
                      💬 Conversation
                    </button>
                    <button
                      className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                        viewMode === "blueprint"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                      onClick={() => setViewMode("blueprint")}
                    >
                      <span>📘 Blueprint Vivant</span>
                      {piConsequences.filter((c) => c.status === "PROPOSED").length > 0 && (
                        <span className="badge badge-warning text-[10px] px-1.5 py-0.5">
                          {piConsequences.filter((c) => c.status === "PROPOSED").length}
                        </span>
                      )}
                    </button>
                  </div>

                  <button
                    className={`btn btn-sm ${showDecisionsPanel ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setShowDecisionsPanel(!showDecisionsPanel)}
                  >
                    ⚖️ Décisions & Arbitrages ({decisionRegister.length})
                  </button>
                  <button
                    className={`btn btn-sm ${showContextPanel ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setShowContextPanel(!showContextPanel)}
                  >
                    📎 Contexte utilisé ({sources.filter((s) => s.contextStatus !== "INACTIVE").length + 1})
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleRequestFinalReview}
                    disabled={isReviewing}
                  >
                    {isReviewing ? "⏳ Relecture..." : "🔍 Demander la relecture finale"}
                  </button>
                </div>
              )}
            </div>

            {/* DÉCISIONS & ARBITRAGES REGISTRE TRANSVERSAL PANEL */}
            {showDecisionsPanel && (
              <div className="card p-5 bg-surface border-2 border-amber-500/30 rounded-xl space-y-4 shadow-md">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚖️</span>
                    <div>
                      <h3 className="font-bold text-md text-foreground">Registre Transversal des Arbitrages ({decisionRegister.length})</h3>
                      <p className="text-xs text-muted">
                        Vue unifiée de l&apos;ensemble des choix, confirmations, exclusions, reports et risques assumés.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={() => setShowDecisionsPanel(false)}
                  >
                    ✕ Fermer
                  </button>
                </div>

                <div className="space-y-3">
                  {decisionRegister.length === 0 ? (
                    <div className="p-4 bg-muted/20 rounded border border-border/40 text-xs text-muted text-center italic">
                      Aucun arbitrage ou décision enregistré pour le moment. Répondez aux questions de l&apos;Architecte Produit pour alimenter ce registre.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {decisionRegister.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-3 bg-background border border-border rounded-lg text-xs space-y-1.5 shadow-sm"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-bold text-sm text-foreground">{entry.title}</span>
                            <div className="flex items-center gap-2">
                              <span className={`badge text-[10px] ${
                                entry.status === "ACTIVE" ? "badge-success" :
                                entry.status === "ASSUMED_RISK" ? "badge-warning" :
                                entry.status === "DEFERRED" ? "badge-info" :
                                "badge-secondary"
                              }`}>
                                {entry.status}
                              </span>
                              <span className="badge badge-outline text-[10px]">{entry.arbitrationType}</span>
                            </div>
                          </div>

                          <p className="text-foreground font-medium">{entry.statement}</p>

                          {entry.rationale && (
                            <div className="p-2 bg-muted/30 rounded italic text-muted text-[11px]">
                              💡 <strong>Justification / Rationale :</strong> {entry.rationale}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-muted pt-1 border-t border-border/40">
                            <span>Provenance : <strong>{entry.provenance}</strong></span>
                            <span>{new Date(entry.decidedAt).toLocaleString("fr-FR")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CONTEXTE UTILISÉ DRAWER / PANEL */}
            {showContextPanel && (
              <div className="card p-5 bg-surface border-2 border-primary/30 rounded-xl space-y-4 shadow-md">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📎</span>
                    <div>
                      <h3 className="font-bold text-md text-foreground">Contexte utilisé</h3>
                      <p className="text-xs text-muted">
                        Documents, notes et paramètres pris en compte par l&apos;Architecte Produit lors des échanges.
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={() => setShowContextPanel(false)}
                  >
                    ✕ Fermer le panneau
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Section Idée & Plateforme */}
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/40 rounded-lg border border-border/60 text-xs space-y-1">
                      <span className="font-bold text-primary block">💡 Idée initiale du Projet</span>
                      <p className="font-semibold text-foreground">{project.name}</p>
                      <p className="text-muted italic whitespace-pre-wrap">{project.description || "Aucune description initiale."}</p>
                    </div>

                    <div className="p-3 bg-muted/40 rounded-lg border border-border/60 text-xs space-y-1">
                      <span className="font-bold text-primary block">📱 Plateforme Canonique</span>
                      <span className="badge badge-info">
                        {(project as any).platform === "ANDROID_EXPO" ? "Mobile Android Expo" : "Web Next.js"}
                      </span>
                    </div>

                    {/* Brief Items Contextual Summary */}
                    {briefItems.length > 0 && (
                      <div className="p-3 bg-muted/30 rounded-lg border border-border/40 text-xs space-y-1">
                        <span className="font-bold text-muted block">💡 Contexte historique (Brief)</span>
                        <p className="text-muted">
                          {briefItems.length} élément(s) de brief enregistrés.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Section Formulaire d'Ajout de Contexte */}
                  <div className="p-4 bg-background border border-border rounded-lg text-xs space-y-3 shadow-sm">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <span>➕ Ajouter du contexte</span>
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="label text-[11px] mb-1">Titre / Libellé facultatif :</label>
                        <input
                          type="text"
                          className="input w-full text-xs"
                          placeholder="ex: Notes d'entretien, spécifications..."
                          value={newContextLabel}
                          onChange={(e) => setNewContextLabel(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label text-[11px] mb-1">Type de contexte :</label>
                        <select
                          className="input w-full text-xs"
                          value={newContextType}
                          onChange={(e) => setNewContextType(e.target.value as any)}
                        >
                          <option value="TEXT">Texte libre / Notes</option>
                          <option value="FILE_TXT">Fichier texte / Note</option>
                          <option value="FILE_MD">Fichier Markdown</option>
                          <option value="CONVERSATION">Extrait de conversation</option>
                        </select>
                      </div>
                      <div>
                        <label className="label text-[11px] mb-1">Contenu documentaire :</label>
                        <textarea
                          className="textarea w-full text-xs"
                          rows={3}
                          placeholder="Collez ici le texte ou les notes à mettre à disposition..."
                          value={newContextText}
                          onChange={(e) => setNewContextText(e.target.value)}
                        />
                      </div>
                      <button
                        className="btn btn-primary btn-sm w-full font-semibold"
                        onClick={handleAddContextSource}
                        disabled={!newContextText.trim()}
                      >
                        Ajouter au contexte 📎
                      </button>
                    </div>
                  </div>
                </div>

                {/* Liste des Sources et Toggles */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted flex items-center justify-between">
                    <span>Document de Contexte ({sources.length})</span>
                    <span className="text-[11px] text-muted font-normal">
                      {sources.filter((s) => s.contextStatus !== "INACTIVE").length} actif(s) pour le prochain tour
                    </span>
                  </h4>

                  {sources.length === 0 ? (
                    <div className="p-3 bg-muted/20 rounded border border-border/40 text-xs text-muted text-center italic">
                      L&apos;entretien utilise actuellement l&apos;idée initiale et la plateforme du projet. Vous pouvez ajouter des notes ou documents ci-dessus.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {sources.map((src) => {
                        const isActive = src.contextStatus !== "INACTIVE";
                        return (
                          <div
                            key={src.id}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 transition-all ${
                              isActive
                                ? "bg-background border-border shadow-sm"
                                : "bg-muted/30 border-border/40 opacity-60"
                            }`}
                          >
                            <div className="space-y-0.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground truncate">{src.label}</span>
                                <span className={`badge text-[9px] ${isActive ? "badge-success" : "badge-secondary"}`}>
                                  {isActive ? "ACTIVE" : "INACTIVE"}
                                </span>
                                <span className="badge badge-outline text-[9px]">{src.type}</span>
                              </div>
                              <p className="text-muted line-clamp-2 italic">{src.content}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                className={`btn btn-xs ${isActive ? "btn-secondary" : "btn-primary"}`}
                                onClick={() => handleToggleSourceStatus(src.id, src.contextStatus)}
                                title={isActive ? "Exclure du prochain tour d'entretien" : "Inclure dans le prochain tour d'entretien"}
                              >
                                {isActive ? "Désactiver ⏸️" : "Activer ▶️"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Validated Product Interview Baseline Card */}
            {piBaseline && (
              <div className="card p-5 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <h3 className="font-bold text-md text-emerald-700 dark:text-emerald-300">
                        Product Interview Baseline v{piBaseline.version} Validée
                      </h3>
                      <p className="text-xs text-muted">
                        Photographie fonctionnelle immuable créée le {new Date(piBaseline.validatedAt).toLocaleString("fr-FR")} • Hash : <code className="font-mono">{piBaseline.contentHash.slice(0, 16)}...</code>
                      </p>
                    </div>
                  </div>
                  <span className="badge badge-success font-semibold px-3 py-1">VALIDATED</span>
                </div>

                <div className="p-3 bg-background/60 rounded-lg text-xs space-y-2 border border-emerald-500/20">
                  <p className="font-medium text-foreground">{piBaseline.narrativeSummary}</p>
                  <div className="flex items-center gap-4 text-muted text-[11px] flex-wrap">
                    <span>📦 <strong>{piBaseline.canonicalInventories.FEATURES.length}</strong> fonctionnalités canoniques</span>
                    <span>📱 <strong>{piBaseline.canonicalInventories.SCREENS.length}</strong> écrans canoniques</span>
                    <span>🗺️ <strong>{piBaseline.canonicalInventories.USER_JOURNEYS.length}</strong> parcours canoniques</span>
                    <span>🔗 Matrice de traçabilité 100% reliée</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (window.confirm("Lancer la mission avec les 18 spécialistes sur la base de cette Product Interview Baseline ?")) {
                        svc.missions.planMission(projectId as EntityId, `Mission Baseline v${piBaseline.version}`);
                        showToast("success", "Mission planifiée avec l'autorité canonique de la Baseline !");
                      }
                    }}
                  >
                    🚀 Lancer les 18 spécialistes avec cette Baseline
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setViewMode("blueprint")}
                  >
                    📘 Consulter la Baseline
                  </button>
                </div>
              </div>
            )}

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
                    {isInitializingInterview ? "⏳ Démarrage..." : "🚀 Commencer l'entretien"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Pre-Review Blockers Warning Card */}
                {preReviewReadiness && !preReviewReadiness.ready && (
                  <div className="p-4 bg-rose-50/30 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-lg text-xs space-y-2">
                    <h4 className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                      <span>⚠️ Relecture Finale Indisponible ({preReviewReadiness.blockers.length} obstacle(s))</span>
                    </h4>
                    <ul className="list-disc pl-4 space-y-1 text-muted">
                      {preReviewReadiness.blockers.map((b, idx) => (
                        <li key={idx}>
                          <strong>{b.code} :</strong> {b.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ORBITE Review Result Panel */}
                {orbiteReviewResult && (
                  <div className="card p-5 bg-indigo-50/20 dark:bg-indigo-950/20 border-2 border-indigo-300 dark:border-indigo-800 rounded-xl space-y-4 shadow-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🔍</span>
                        <h3 className="font-bold text-md text-indigo-700 dark:text-indigo-300">
                          Rapport du Relecteur ORBITE Silencieux
                        </h3>
                      </div>
                      <span className="badge badge-info text-xs">Statut: {orbiteReviewResult.status}</span>
                    </div>

                    <p className="text-xs text-muted">{orbiteReviewResult.reviewSummary}</p>

                    {/* Strengths */}
                    {orbiteReviewResult.strengths.length > 0 && (
                      <div className="space-y-1">
                        <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                          💪 Points Solides du Blueprint :
                        </span>
                        <ul className="list-disc pl-4 text-xs text-muted space-y-0.5">
                          {orbiteReviewResult.strengths.map((str, i) => (
                            <li key={i}>{str}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Findings list */}
                    {orbiteReviewResult.findings.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Observations & Arbitrages Recommandés ({orbiteReviewResult.findings.length})
                        </h4>
                        {orbiteReviewResult.findings.map((fnd) => (
                          <div
                            key={fnd.id}
                            className="p-3 bg-background border border-border rounded-lg text-xs space-y-2 shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm">{fnd.title}</span>
                              <div className="flex items-center gap-2">
                                <span className={`badge text-[10px] ${fnd.level === 'BLOCKING' ? 'badge-danger' : 'badge-warning'}`}>
                                  {fnd.level}
                                </span>
                                <span className="badge badge-secondary text-[10px]">{fnd.category}</span>
                              </div>
                            </div>
                            <p className="text-muted">{fnd.observation}</p>
                            <div className="p-2 bg-muted/40 rounded italic text-primary">
                              💡 <strong>Résolution suggérée :</strong> {fnd.suggestedResolution}
                            </div>

                            {/* Decision controls */}
                            <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  className="btn btn-success btn-xs"
                                  onClick={() => handleRecordFindingDecision(fnd, "ACCEPTED")}
                                >
                                  Accepter ✅
                                </button>
                                <button
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleRecordFindingDecision(fnd, "MAINTAINED")}
                                >
                                  Maintenir la décision 🛡️
                                </button>
                                <button
                                  className="btn btn-warning btn-xs"
                                  onClick={() => handleRecordFindingDecision(fnd, "DEFERRED")}
                                >
                                  Reporter ⏳
                                </button>
                                <button
                                  className="btn btn-ghost btn-xs text-rose-500"
                                  onClick={() => handleRecordFindingDecision(fnd, "DISMISSED")}
                                >
                                  Écarter ❌
                                </button>
                              </div>
                              {fnd.decision && (
                                <span className="badge badge-success text-[10px]">
                                  Décision : {fnd.decision}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Validate Baseline Action */}
                    <div className="pt-3 border-t border-border/60 flex justify-end">
                      <button
                        className="btn btn-primary btn-md font-bold"
                        onClick={handleValidateBaseline}
                        disabled={isValidatingBaseline}
                      >
                        {isValidatingBaseline ? "⏳ Validation..." : "🚀 Valider le Blueprint Fonctionnel & Créer la Baseline"}
                      </button>
                    </div>
                  </div>
                )}
                {/* Stat Counters & Maturity Banner */}
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">📌 Session : <strong>{piSession.status}</strong></span>
                    <span className="badge badge-info">Étape : {piSession.maturityStep}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
                    <span>🗣️ <strong>{piMessages.length}</strong> messages</span>
                    <span>✅ <strong>{piAssertions.filter((a) => a.status === "CONFIRMED").length}</strong> confirmés</span>
                    <span>💡 <strong>{piAssertions.filter((a) => a.status === "INFERRED").length}</strong> hypothèses</span>
                    <span>❓ <strong>{piSession.blockingUnknownsCount}</strong> inconnues bloquantes</span>
                    <span>⚡ <strong>{piContradictions.filter((c) => c.status === "OPEN").length}</strong> contradictions</span>
                    <span>🎯 <strong>{piConsequences.filter((c) => c.status === "PROPOSED").length}</strong> conséquences à arbitrer</span>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleStartInterview}
                    disabled={isInitializingInterview || isProcessingTurn}
                  >
                    🔄 Réinitialiser
                  </button>
                </div>

                {/* Pending Decisions Alert Banner */}
                {(piConsequences.filter((c) => c.status === "PROPOSED").length > 0 || piContradictions.filter((c) => c.status === "OPEN").length > 0) && (
                  <div className="p-3 bg-amber-50/30 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-xs flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚡</span>
                      <div>
                        <strong>Arbitrages en attente :</strong>{" "}
                        {piConsequences.filter((c) => c.status === "PROPOSED").length} conséquence(s) proposée(s) et{" "}
                        {piContradictions.filter((c) => c.status === "OPEN").length} contradiction(s) nécessitent votre validation.
                      </div>
                    </div>
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => setViewMode("blueprint")}
                    >
                      Examiner dans le Blueprint Vivant ➔
                    </button>
                  </div>
                )}

                {/* Turn Impact Summary Banner */}
                {turnImpactSummary && (
                  <div className="p-3 bg-emerald-50/20 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">💡</span>
                      <div>
                        <strong>Impact du dernier tour :</strong> {turnImpactSummary.summary}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span>✅ +{turnImpactSummary.confirmedAssertionsCount} confirmés</span>
                      <span>💡 +{turnImpactSummary.inferredAssertionsCount} inférés</span>
                      <span>📘 {turnImpactSummary.updatedSectionsCount} sections MàJ</span>
                    </div>
                  </div>
                )}

                {/* VIEW 1: CONVERSATION VIEW */}
                {viewMode === "conversation" && (
                  <div className="space-y-4">
                    {/* Main Chat Interface */}
                    <div className="card p-4 space-y-4 max-h-[500px] overflow-y-auto flex flex-col border border-border">
                      {piMessages.length === 0 ? (
                        <div className="text-center text-sm text-muted py-8">
                          Aucun message. Cliquez sur Commencer pour lancer le premier tour.
                        </div>
                      ) : (
                        piMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${msg.role === "USER" ? "items-end" : "items-start"}`}
                          >
                            <div className="text-xs text-muted mb-1 flex items-center gap-1">
                              {msg.role === "USER" ? "👤 Vous" : "🏛️ Architecte Produit"}
                              <span className="opacity-60">• {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div
                              className={`p-3 rounded-lg max-w-[85%] text-sm whitespace-pre-wrap ${
                                msg.role === "USER"
                                  ? "bg-primary text-primary-foreground rounded-br-none"
                                  : "bg-surface border border-border rounded-bl-none shadow-sm"
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ))
                      )}

                      {isProcessingTurn && (
                        <div className="flex items-center gap-2 text-sm text-muted italic p-2">
                          <span className="animate-spin">⏳</span> L&apos;Architecte Produit formule sa réponse...
                        </div>
                      )}
                    </div>

                    {/* Active Question Widget */}
                    {activeQuestion ? (
                      <div className="card p-4 space-y-3 bg-indigo-50/20 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                            ❓ Question Active ({activeQuestion.responseType})
                          </span>
                          <div className="flex items-center gap-2">
                            {questionTarget?.axis && (
                              <span className="badge badge-primary text-[10px]">Axe : {questionTarget.axis}</span>
                            )}
                            {activeQuestion.targetSubject && (
                              <span className="badge badge-secondary text-[10px]">{activeQuestion.targetSubject}</span>
                            )}
                          </div>
                        </div>
                        
                        <p className="font-semibold text-sm">{activeQuestion.text}</p>
                        
                        {/* Pourquoi maintenant ? */}
                        <div className="p-2.5 bg-background/50 rounded border border-border/50 text-xs space-y-1">
                          <div className="font-semibold text-primary flex items-center gap-1">
                            <span>🎯 Pourquoi cette question maintenant ?</span>
                          </div>
                          <p className="text-muted italic">
                            {questionTarget?.reason || activeQuestion.rationale || "Cette question vise à lever l'incertitude prioritaire du projet."}
                          </p>
                        </div>

                        {/* Options button / Je ne sais pas encore */}
                        {showJeNeSaisPasOptions && (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-2">
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              🤷‍♂️ Comment souhaitez-vous procéder ?
                            </span>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleProcessTurn("à voir plus tard")}
                                disabled={isProcessingTurn}
                              >
                                ⏳ Décider plus tard (Reporter cette question)
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleProcessTurn("propose-moi des options")}
                                disabled={isProcessingTurn}
                              >
                                💡 Proposer 3 options (Demander des suggestions)
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowJeNeSaisPasOptions(false)}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Widgets per Question Type */}
                        <div className="pt-2 space-y-2">
                          {activeQuestion.options && activeQuestion.options.length > 0 && (
                            <div className="grid grid-cols-1 gap-2">
                              {activeQuestion.options.map((opt: string, idx: number) => (
                                <button
                                  key={idx}
                                  className="btn btn-secondary btn-sm text-left justify-start hover:border-primary"
                                  disabled={isProcessingTurn}
                                  onClick={() => handleProcessTurn(opt)}
                                >
                                  👉 {opt}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Text response field */}
                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              className="input flex-1 text-sm"
                              placeholder="Saisissez votre réponse ou précision..."
                              value={userAnswerInput}
                              onChange={(e) => setUserAnswerInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && userAnswerInput.trim() && !isProcessingTurn) {
                                  handleProcessTurn(userAnswerInput);
                                }
                              }}
                              disabled={isProcessingTurn}
                            />
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={isProcessingTurn}
                              onClick={() => setShowJeNeSaisPasOptions(!showJeNeSaisPasOptions)}
                              title="Indiquez que vous ne savez pas encore pour recevoir des options ou reporter."
                            >
                              Je ne sais pas 🤷‍♂️
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={!userAnswerInput.trim() || isProcessingTurn}
                              onClick={() => handleProcessTurn(userAnswerInput)}
                            >
                              Envoyer 🚀
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-muted rounded-lg text-xs text-muted text-center">
                        Entretien cadré ou aucune question en attente. Vous pouvez saisir une remarque libre ci-dessous.
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            className="input flex-1 text-sm"
                            placeholder="Remarque ou précision libre..."
                            value={userAnswerInput}
                            onChange={(e) => setUserAnswerInput(e.target.value)}
                            disabled={isProcessingTurn}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!userAnswerInput.trim() || isProcessingTurn}
                            onClick={() => handleProcessTurn(userAnswerInput)}
                          >
                            Envoyer 🚀
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW 2: BLUEPRINT VIVANT VIEW */}
                {viewMode === "blueprint" && (
                  <div className="space-y-6">
                    {/* Conséquences Proposées en Attente */}
                    {piConsequences.filter((c) => c.status === "PROPOSED").length > 0 && (
                      <div className="card p-4 space-y-3 bg-amber-50/20 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800">
                        <h3 className="font-bold text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                          <span>🎯 Conséquences Proposées à Arbitrer</span>
                          <span className="badge badge-warning text-xs">
                            {piConsequences.filter((c) => c.status === "PROPOSED").length} en attente
                          </span>
                        </h3>
                        <p className="text-xs text-muted">
                          L&apos;Architecte a déduit ces conséquences suite à vos réponses. Acceptez, corrigez ou refusez chaque élément pour mettre à jour le Blueprint.
                        </p>

                        <div className="space-y-2">
                          {piConsequences
                            .filter((c) => c.status === "PROPOSED")
                            .map((cons) => (
                              <div
                                key={cons.id}
                                className="p-3 bg-background border border-border rounded-lg text-xs space-y-2 shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm">{cons.statement}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="badge badge-secondary text-[10px]">Impact: {cons.impact}</span>
                                    <span className="badge badge-info text-[10px]">Section: {cons.targetSectionId}</span>
                                  </div>
                                </div>
                                <p className="text-muted italic">{cons.rationale}</p>

                                <div className="flex items-center gap-2 pt-1 flex-wrap">
                                  <button
                                    className="btn btn-success btn-sm text-[11px]"
                                    onClick={() => handleAcceptConsequence(cons.id)}
                                  >
                                    Accepter ✅
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm text-[11px]"
                                    onClick={() => handleCorrectConsequence(cons.id)}
                                  >
                                    Corriger ✏️
                                  </button>
                                  <button
                                    className="btn btn-warning btn-sm text-[11px]"
                                    onClick={() => handleDeferConsequence(cons.id)}
                                  >
                                    Reporter ⏳
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm text-[11px]"
                                    onClick={() => handleRejectConsequence(cons.id)}
                                  >
                                    Refuser ❌
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Open Contradictions */}
                    {piContradictions.filter((c) => c.status === "OPEN").length > 0 && (
                      <div className="card p-4 space-y-3 bg-rose-50/20 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-800">
                        <h3 className="font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2">
                          <span>⚡ Contradictions à Résoudre</span>
                          <span className="badge badge-danger text-xs">
                            {piContradictions.filter((c) => c.status === "OPEN").length} ouvertes
                          </span>
                        </h3>

                        <div className="space-y-2">
                          {piContradictions
                            .filter((c) => c.status === "OPEN")
                            .map((ctr) => (
                              <div
                                key={ctr.id}
                                className="p-3 bg-background border border-border rounded-lg text-xs space-y-2 shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm">{ctr.subject}</span>
                                  <span className="badge badge-danger text-[10px]">
                                    {ctr.isBlocking ? "Bloquante" : "Important"}
                                  </span>
                                </div>
                                <p className="text-muted">{ctr.explanation}</p>
                                <div className="pt-1">
                                  <button
                                    className="btn btn-primary btn-sm text-[11px]"
                                    onClick={() => handleResolveContradiction(ctr.id)}
                                  >
                                    Résoudre la contradiction ✏️
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* 14 Sections Détaillées du Blueprint Vivant */}
                    <div className="space-y-4">
                      <h3 className="text-md font-bold flex items-center justify-between">
                        <span>📘 Les 14 Sections du Blueprint Vivant</span>
                        <span className="text-xs text-muted font-normal">
                          {piBlueprint ? Object.values(piBlueprint.sections).filter((s) => s.status !== "EMPTY").length : 0} / 14 Alimentées
                        </span>
                      </h3>

                      {piBlueprint ? (
                        <div className="space-y-3">
                          {Object.values(piBlueprint.sections).map((sec) => {
                            const secAssertions = piAssertions.filter(
                              (a) => a.sectionId === sec.id || (a.axis && AXIS_TO_SECTION[a.axis] === sec.id)
                            );
                            const secConsequences = piConsequences.filter((c) => c.targetSectionId === sec.id);

                            return (
                              <details
                                key={sec.id}
                                className="card p-4 border border-border group text-xs space-y-3"
                                open={sec.status !== "EMPTY"}
                              >
                                <summary className="cursor-pointer font-bold text-sm flex items-center justify-between list-none">
                                  <div className="flex items-center gap-2">
                                    <span>{sec.title}</span>
                                    <span
                                      className={`badge text-[10px] ${
                                        sec.status === "CONFIRMED"
                                          ? "badge-success"
                                          : sec.status === "INFERRED" || sec.status === "TO_CONFIRM"
                                          ? "badge-warning"
                                          : sec.status === "CONTRADICTORY"
                                          ? "badge-danger"
                                          : "badge-secondary"
                                      }`}
                                    >
                                      {STATUS_LABELS_FR[sec.status] || sec.status}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-muted text-[11px] font-normal">
                                    <span>✅ {secAssertions.filter((a) => a.status === "CONFIRMED").length} confirmés</span>
                                    <span>💡 {secAssertions.filter((a) => a.status === "INFERRED").length} hypothèses</span>
                                    <span>🎯 {secConsequences.filter((c) => c.status === "PROPOSED").length} conséquences</span>
                                    <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
                                  </div>
                                </summary>

                                <div className="pt-3 border-t border-border/50 space-y-3">
                                  {/* Résumé de section */}
                                  <div className="p-3 bg-muted/30 rounded border border-border/40">
                                    <span className="font-semibold text-muted text-[11px] block mb-1">Résumé de la section :</span>
                                    <p className="whitespace-pre-line text-sm">{sec.summary || "Aucun contenu enregistré pour cette section."}</p>
                                  </div>

                                  {/* Assertions Confirmées */}
                                  {secAssertions.filter((a) => a.status === "CONFIRMED").length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 block text-[11px]">
                                        ✅ Faits Confirmés :
                                      </span>
                                      {secAssertions
                                        .filter((a) => a.status === "CONFIRMED")
                                        .map((a) => (
                                          <div
                                            key={a.id}
                                            className="p-2 bg-emerald-50/20 dark:bg-emerald-950/20 rounded border border-emerald-200 dark:border-emerald-800 flex items-center justify-between flex-wrap gap-2"
                                          >
                                            <div>
                                              <span>{a.statement}</span>
                                              <span className="text-[10px] text-muted block italic">
                                                Source : {SOURCE_LABELS_FR[a.source] || a.source}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <button
                                                className="btn btn-ghost btn-xs text-[10px]"
                                                onClick={() => handleCorrectAssertion(a.id)}
                                              >
                                                ✏️ Corriger
                                              </button>
                                              <button
                                                className="btn btn-ghost btn-xs text-[10px] text-rose-500"
                                                onClick={() => handleExcludeAssertion(a.id)}
                                              >
                                                ❌ Exclure
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  )}

                                  {/* Assertions Hypothèses */}
                                  {secAssertions.filter((a) => a.status === "INFERRED").length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="font-semibold text-amber-600 dark:text-amber-400 block text-[11px]">
                                        💡 Hypothèses à Confirmer :
                                      </span>
                                      {secAssertions
                                        .filter((a) => a.status === "INFERRED")
                                        .map((a) => (
                                          <div
                                            key={a.id}
                                            className="p-2 bg-amber-50/20 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800 flex items-center justify-between flex-wrap gap-2"
                                          >
                                            <div>
                                              <span>{a.statement}</span>
                                              <span className="text-[10px] text-muted block italic">
                                                Source : {SOURCE_LABELS_FR[a.source] || a.source}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <button
                                                className="btn btn-success btn-xs text-[10px]"
                                                onClick={() => handleConfirmAssertion(a.id)}
                                              >
                                                Confirmer ✅
                                              </button>
                                              <button
                                                className="btn btn-ghost btn-xs text-[10px]"
                                                onClick={() => handleDeferAssertion(a.id)}
                                              >
                                                Reporter ⏳
                                              </button>
                                              <button
                                                className="btn btn-ghost btn-xs text-[10px] text-rose-500"
                                                onClick={() => handleExcludeAssertion(a.id)}
                                              >
                                                Exclure ❌
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  )}

                                  {/* Conséquences rattachées à la section */}
                                  {secConsequences.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="font-semibold text-indigo-600 dark:text-indigo-400 block text-[11px]">
                                        🎯 Conséquences déduites :
                                      </span>
                                      {secConsequences.map((cons) => (
                                        <div
                                          key={cons.id}
                                          className="p-2 bg-indigo-50/20 dark:bg-indigo-950/20 rounded border border-indigo-200 dark:border-indigo-800 flex items-center justify-between flex-wrap gap-2"
                                        >
                                          <div>
                                            <span className="font-medium">{cons.statement}</span>
                                            <span className="badge badge-secondary text-[9px] ml-2">{cons.status}</span>
                                          </div>
                                          {cons.status === "PROPOSED" && (
                                            <div className="flex items-center gap-1">
                                              <button
                                                className="btn btn-success btn-xs text-[10px]"
                                                onClick={() => handleAcceptConsequence(cons.id)}
                                              >
                                                Accepter
                                              </button>
                                              <button
                                                className="btn btn-ghost btn-xs text-[10px]"
                                                onClick={() => handleRejectConsequence(cons.id)}
                                              >
                                                Refuser
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-muted">Chargement du blueprint...</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Collapsible Diagnostic Panel */}
                <div className="card p-3 border border-border/60 text-xs space-y-2">
                  <button
                    className="flex items-center justify-between w-full font-semibold text-muted hover:text-foreground"
                    onClick={() => setShowDiagnostic(!showDiagnostic)}
                  >
                    <span>🔍 Diagnostic Moteur ORBITE (Interne)</span>
                    <span>{showDiagnostic ? "▲ Masquer" : "▼ Afficher"}</span>
                  </button>
                  {showDiagnostic && (
                    <div className="pt-2 border-t border-border/40 space-y-2 font-mono text-[11px]">
                      <div>
                        <strong>Axe ciblé actuel :</strong> {questionTarget?.axis || "Non défini"}
                      </div>
                      <div>
                        <strong>Raison du choix :</strong> {questionTarget?.reason || "Non définie"}
                      </div>
                      <div>
                        <strong>Étape de maturité :</strong> {piSession.maturityStep}
                      </div>
                      {questionTarget?.candidates && (
                        <div>
                          <strong>Top 3 candidats calculés par ORBITE :</strong>
                          <ul className="list-disc pl-4 mt-1 space-y-0.5">
                            {questionTarget.candidates.map((c: any, i: number) => (
                              <li key={i}>
                                {c.axis} (Score: {c.score}) — {c.reasons.join(", ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
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

        {activeTab === "delivery" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3 flex-wrap gap-2">
              <div>
                <h2>🚀 5. Validation et livraison</h2>
                <p className="text-sm text-muted">
                  Audits de conformité, gel de la baseline technique, résolution des conflits et paquet final de livraison.
                </p>
              </div>

              {/* Sub-tabs bar */}
              <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-lg text-xs">
                <button
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeDeliverySub === "audits"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                  onClick={() => router.replace(`${pathname}?tab=delivery&sub=audits`, { scroll: false })}
                >
                  🔍 Audits ({findings.length})
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeDeliverySub === "baseline"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                  onClick={() => router.replace(`${pathname}?tab=delivery&sub=baseline`, { scroll: false })}
                >
                  📌 Baseline ({baselines.length})
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeDeliverySub === "conflicts"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                  onClick={() => router.replace(`${pathname}?tab=delivery&sub=conflicts`, { scroll: false })}
                >
                  ⚡ Conflits ({conflicts.length})
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeDeliverySub === "package"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                  onClick={() => router.replace(`${pathname}?tab=delivery&sub=package`, { scroll: false })}
                >
                  📦 Package Final
                </button>
              </div>
            </div>

            {/* Sub-view: Audits */}
            {activeDeliverySub === "audits" && (
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
                    <h3 className="mb-3">{t("audits.gates")}</h3>
                    <div className="grid grid-2">
                      {gates.map((g) => (
                        <div key={g.id} className="card">
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className={`badge badge-${g.status === "PASSED" ? "completed" : "warning"}`}
                            >
                              {g.status === "PASSED"
                                ? lang === "fr"
                                  ? "Validé"
                                  : "Passed"
                                : g.status}
                            </span>
                            {g.blocking && (
                              <span
                                className="text-xs font-semibold"
                                style={{ color: "var(--color-warning)" }}
                              >
                                {lang === "fr" ? "Bloquant" : "Blocking"}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold">{g.name}</h4>
                          <p className="text-xs text-muted mt-1">{g.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h3 className="mb-3">{t("audits.findings")}</h3>
                {findings.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🔍</div>
                    <h3>{lang === "fr" ? "Aucune observation d'audit" : "No audit findings"}</h3>
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

            {/* Sub-view: Baseline */}
            {activeDeliverySub === "baseline" && (
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

            {/* Sub-view: Conflicts */}
            {activeDeliverySub === "conflicts" && (
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
                      <p className="mb-3 text-sm">{c.description}</p>

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
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  className="input text-xs"
                                  style={{ flex: 1 }}
                                  placeholder={
                                    lang === "fr"
                                      ? "Justification de ce choix..."
                                      : "Rationale for this choice..."
                                  }
                                  value={conflictRationale[c.id] || ""}
                                  onChange={(e) =>
                                    setConflictRationale({
                                      ...conflictRationale,
                                      [c.id]: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => resolveConflict(c.id, opt.id)}
                                >
                                  {t("action.resolve")}
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

            {/* Sub-view: Package Final */}
            {activeDeliverySub === "package" && (
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
