import {
  EntityId,
  ProductInterviewSession,
  KnowledgeAssertion,
  ProductInterviewMessage,
  FunctionalBlueprint,
  BlueprintSectionId,
  BlueprintSection,
  BLUEPRINT_SECTION_TITLES,
  validateProductArchitectResponse,
  ProductArchitectResponse,
  ProductInterviewContradiction,
  evaluateAxes,
  computeMaturityFromAxes,
  selectNextQuestionTarget,
  AXIS_TO_SECTION,
  QuestionTarget,
  OrbiteAxis,
  TurnImpactSummary,
} from "@pbh/domain";
import { RepositoryRegistry } from "@pbh/repositories";
import type { IModelProvider } from "@pbh/model-gateway";

export class ProductInterviewService {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider?: IModelProvider
  ) {}

  async getSession(projectId: EntityId): Promise<ProductInterviewSession | null> {
    return this.repos.productInterviewSessions.getByProjectId(projectId);
  }

  async initSession(projectId: EntityId): Promise<{
    session: ProductInterviewSession;
    blueprint: FunctionalBlueprint;
    isNew: boolean;
  }> {
    const existing = await this.repos.productInterviewSessions.getByProjectId(projectId);
    if (existing) {
      const blueprint = await this.repos.functionalBlueprints.getBySessionId(existing.id);
      return { session: existing, blueprint: blueprint!, isNew: false };
    }

    const project = await this.repos.projects.getById(projectId);
    const now = new Date().toISOString();
    const sessionId = `pi_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` as EntityId;

    const session: ProductInterviewSession = {
      id: sessionId,
      projectId,
      status: "IN_PROGRESS",
      maturityStep: "EXPLORATION",
      questionCount: 0,
      blockingUnknownsCount: 1,
      importantUnknownsCount: 4,
      openContradictionsCount: 0,
      allowFinalize: false,
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const sectionIds: BlueprintSectionId[] = [
      "ORIGINAL_INTUITION",
      "REAL_PROBLEM",
      "DECISION_TO_SIMPLIFY",
      "MINIMAL_PROMISE",
      "USAGE_MOMENT",
      "VALUE_LOOP",
      "PRIMARY_EXPERIENCE",
      "MVP_SCOPE",
      "DATA_MATRIX",
      "RULES_AND_AI",
      "WEAK_STATES",
      "TRUST_AND_CONTROL",
      "EVOLUTION",
      "TRANSMISSION",
    ];

    const sections: Record<BlueprintSectionId, BlueprintSection> = {} as any;
    for (const sid of sectionIds) {
      sections[sid] = {
        id: sid,
        title: BLUEPRINT_SECTION_TITLES[sid],
        summary: sid === "ORIGINAL_INTUITION" && project?.description ? project.description : "",
        status: sid === "ORIGINAL_INTUITION" && project?.description ? "TO_CONFIRM" : "EMPTY",
        assertionIds: [],
        decisionIds: [],
        unknownIds: [],
        contradictionIds: [],
        lastUpdatedAt: now,
        version: 1,
      };
    }

    const blueprint: FunctionalBlueprint = {
      id: `pi_bp_${sessionId}` as EntityId,
      projectId,
      sessionId,
      sections,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    await this.repos.productInterviewSessions.save(session);
    await this.repos.functionalBlueprints.save(blueprint);

    if (project?.description) {
      const assertion: KnowledgeAssertion = {
        id: `pi_assert_${Date.now()}_1` as EntityId,
        projectId,
        sessionId,
        sectionId: "ORIGINAL_INTUITION",
        axis: "REAL_PROBLEM",
        statement: project.description,
        status: "INFERRED",
        source: "PROJECT_IDEA",
        confidence: 90,
        impactedSectionIds: ["ORIGINAL_INTUITION", "REAL_PROBLEM"],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await this.repos.knowledgeAssertions.save(assertion);
    }

    return { session, blueprint, isNew: true };
  }

  /**
   * Tour de conversation avec l'Architecte Produit et le Moteur Déterministe ORBITE.
   * Garantit une assertion CONFIRMED (I1), la dérivation pure des sections (I2), et 1 seul appel IA (I3).
   */
  async processTurn(
    projectId: EntityId,
    userInput?: string
  ): Promise<{
    session: ProductInterviewSession;
    blueprint: FunctionalBlueprint;
    response: ProductArchitectResponse;
    activeQuestion: any | null;
    questionTarget: QuestionTarget;
  }> {
    const { session, blueprint } = await this.initSession(projectId);
    let assertions = await this.repos.knowledgeAssertions.getBySessionId(session.id);
    const messages = await this.repos.productInterviewMessages.getBySessionId(session.id);
    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(session.id);
    const project = await this.repos.projects.getById(projectId);
    const now = new Date().toISOString();

    const createdAssertionIds: EntityId[] = [];

    // I1 — GUARANTEED CONFIRMED ASSERTION FROM USER INPUT
    if (userInput && userInput.trim().length > 0) {
      const targetAxis: OrbiteAxis = session.activeQuestionTarget?.axis || "REAL_PROBLEM";
      const targetSection: BlueprintSectionId = AXIS_TO_SECTION[targetAxis] || "REAL_PROBLEM";

      const userAssertionId = `pi_assert_usr_${Date.now()}` as EntityId;
      const userAssertion: KnowledgeAssertion = {
        id: userAssertionId,
        projectId,
        sessionId: session.id,
        sectionId: targetSection,
        axis: targetAxis,
        statement: userInput.trim(),
        status: "CONFIRMED",
        source: "USER_RESPONSE",
        confidence: 100,
        impactedSectionIds: [targetSection],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      await this.repos.knowledgeAssertions.save(userAssertion);
      createdAssertionIds.push(userAssertionId);

      // Save user message
      const userMsg: ProductInterviewMessage = {
        id: `pi_msg_user_${Date.now()}` as EntityId,
        sessionId: session.id,
        projectId,
        role: "USER",
        content: userInput.trim(),
        type: "ANSWER",
        inResponseToQuestionId: session.activeQuestionId,
        createdAssertionIds: [userAssertionId],
        modifiedAssertionIds: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await this.repos.productInterviewMessages.save(userMsg);

      // Re-fetch assertions after adding the confirmed assertion
      assertions = await this.repos.knowledgeAssertions.getBySessionId(session.id);
    }

    // 1. Evaluate Axis States & Deterministic Question Target (I3)
    const currentAxisStates = evaluateAxes(assertions);
    const lastAxis = session.activeQuestionTarget?.axis || null;
    const questionTarget = selectNextQuestionTarget(currentAxisStates, lastAxis, contradictions);

    // 2. Build Compact Context for LLM
    const compactContext = {
      project: {
        name: project?.name,
        description: project?.description,
      },
      session: {
        status: session.status,
        maturityStep: session.maturityStep,
        questionCount: session.questionCount,
      },
      targetToClarify: {
        axis: questionTarget.axis,
        sectionId: AXIS_TO_SECTION[questionTarget.axis],
        reason: questionTarget.reason,
        phase: questionTarget.maturityPhase,
      },
      assertionsCount: assertions.length,
      assertions: assertions.slice(-10).map((a) => ({
        id: a.id,
        sectionId: a.sectionId,
        axis: a.axis,
        statement: a.statement,
        status: a.status,
      })),
      blueprintSummaries: Object.values(blueprint.sections).map((s) => ({
        id: s.id,
        status: s.status,
        summary: s.summary,
      })),
      openContradictions: contradictions.filter((c) => c.status === "OPEN").map((c) => c.subject),
      recentMessages: messages.slice(-6).map((m) => `${m.role}: ${m.content}`),
    };

    // 3. Prepare Prompt & Call Model Gateway (Single Call)
    const activePromptTemplate = await this.repos.prompts.getActivePrompt("PRODUCT-INTERVIEW-ARCHITECT");
    const systemPrompt =
      activePromptTemplate?.systemPrompt ||
      "Tu es l'Architecte Produit. Pose UNE SEULE question ciblée sur l'axe spécifié et réponds au format JSON ProductArchitectResponse.";

    const fullPrompt = `[CONTEXTE COMPACT ET CIBLE ORBITE]
${JSON.stringify(compactContext, null, 2)}

[CONSIGNE IMPÉRATIVE DE CIBLAGE]
Votre prochaine question doit OBLIGATOIREMENT cibler l'axe ORBITE : "${questionTarget.axis}" (Section affectée : ${AXIS_TO_SECTION[questionTarget.axis]}).
Raison du ciblage : ${questionTarget.reason}.

[DERNIER MESSAGE UTILISATEUR]
${userInput || "(Initialisation du premier tour de l'entretien)"}`;

    if (!this.provider) {
      throw new Error("Aucun provider IA configuré pour le ProductInterviewService.");
    }

    const rawResult = await this.provider.complete({
      prompt: fullPrompt,
      systemPrompt,
      tier: "SOL",
      correlationId: `pi_${session.id}_${Date.now()}`,
    });

    // 4. Clean & Parse JSON Response
    let parsed: ProductArchitectResponse;
    try {
      let content = rawResult.content.trim();
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch && fenceMatch[1]) content = fenceMatch[1].trim();
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        content = content.slice(jsonStart, jsonEnd + 1);
      }
      parsed = JSON.parse(content);
    } catch (e: any) {
      throw new Error(`Réponse IA invalide (échec de parsing JSON) : ${e.message}`);
    }

    // 5. Validate ProductArchitectResponse (Validate-Then-Commit)
    const val = validateProductArchitectResponse(parsed);
    if (!val.valid) {
      throw new Error(`Contrat IA violé : ${val.reason}`);
    }

    // 6. Process Additional Inferred Assertions & Blueprint Updates
    if (Array.isArray(parsed.knowledgeUpdates)) {
      for (const ku of parsed.knowledgeUpdates) {
        if (ku.statement && ku.sectionId) {
          const assId = `pi_assert_inf_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` as EntityId;
          const assertion: KnowledgeAssertion = {
            id: assId,
            projectId,
            sessionId: session.id,
            sectionId: ku.sectionId,
            axis: ku.axis || (Object.keys(AXIS_TO_SECTION).find((a) => AXIS_TO_SECTION[a as OrbiteAxis] === ku.sectionId) as OrbiteAxis) || questionTarget.axis,
            statement: ku.statement,
            status: ku.status || "INFERRED",
            source: ku.source || "AI_INFERENCE",
            impactedSectionIds: ku.impactedSectionIds || [ku.sectionId],
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          await this.repos.knowledgeAssertions.save(assertion);
          createdAssertionIds.push(assId);
        }
      }
    }

    // Re-fetch all assertions to perform PURE DEVIATION of Blueprint Sections & Maturity (I2)
    const allAssertions = await this.repos.knowledgeAssertions.getBySessionId(session.id);
    const updatedAxisStates = evaluateAxes(allAssertions);
    const maturityResult = computeMaturityFromAxes(updatedAxisStates, contradictions);

    // Derive 14 Blueprint Sections Status & Summaries (I2)
    const updatedSections: Record<BlueprintSectionId, BlueprintSection> = { ...blueprint.sections };
    let updatedSectionsCount = 0;

    for (const sid of Object.keys(updatedSections) as BlueprintSectionId[]) {
      const currentSec = updatedSections[sid];
      const secAssertions = allAssertions.filter((a) => a.sectionId === sid || (a.axis && AXIS_TO_SECTION[a.axis] === sid));
      const secAssertionIds = secAssertions.map((a) => a.id);

      const hasConfirmed = secAssertions.some((a) => a.status === "CONFIRMED");
      const hasInferred = secAssertions.some((a) => a.status === "INFERRED");

      let derivedStatus = currentSec.status;
      if (hasConfirmed) derivedStatus = "CONFIRMED";
      else if (hasInferred) derivedStatus = "INFERRED";

      // Calculate derived summary if not provided explicitly by LLM blueprintUpdates
      const explicitUpdate = Array.isArray(parsed.blueprintUpdates) ? parsed.blueprintUpdates.find((bu) => bu.id === sid) : null;
      let summary = explicitUpdate?.summary || currentSec.summary;

      if (!summary && secAssertions.length > 0) {
        summary = secAssertions.map((a) => `${a.status === "CONFIRMED" ? "✅" : "💡"} ${a.statement}`).join("\n");
      }

      if (derivedStatus !== currentSec.status || summary !== currentSec.summary || secAssertionIds.length !== currentSec.assertionIds.length) {
        updatedSectionsCount++;
        updatedSections[sid] = {
          ...currentSec,
          status: derivedStatus,
          summary: summary || currentSec.summary,
          assertionIds: secAssertionIds,
          lastUpdatedAt: now,
          version: currentSec.version + 1,
        };
      }
    }

    // 7. Save Assistant Message
    const turnImpact: TurnImpactSummary = parsed.turnImpact || {
      summary: `Ce tour a permis de préciser l'axe ${questionTarget.axis} (Section: ${BLUEPRINT_SECTION_TITLES[AXIS_TO_SECTION[questionTarget.axis]]}).`,
      confirmedAssertionsCount: allAssertions.filter((a) => a.status === "CONFIRMED").length,
      inferredAssertionsCount: allAssertions.filter((a) => a.status === "INFERRED").length,
      updatedSectionsCount,
    };

    const assistantMsg: ProductInterviewMessage = {
      id: `pi_msg_ast_${Date.now()}` as EntityId,
      sessionId: session.id,
      projectId,
      role: "ASSISTANT",
      content: parsed.assistantMessage,
      type: parsed.question ? "QUESTION" : "SYNTHESIS",
      inResponseToQuestionId: session.activeQuestionId,
      createdAssertionIds,
      modifiedAssertionIds: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repos.productInterviewMessages.save(assistantMsg);

    // 8. Save Updated Blueprint & Session State
    const updatedBlueprint: FunctionalBlueprint = {
      ...blueprint,
      sections: updatedSections,
      updatedAt: now,
      version: blueprint.version + 1,
    };
    await this.repos.functionalBlueprints.save(updatedBlueprint);

    const updatedSession: ProductInterviewSession = {
      ...session,
      status: parsed.nextState || "WAITING_FOR_USER",
      maturityStep: maturityResult.maturityStep,
      activeQuestionTarget: questionTarget,
      activeQuestionId: parsed.question ? parsed.question.id : null,
      questionCount: session.questionCount + (parsed.question ? 1 : 0),
      blockingUnknownsCount: maturityResult.blockingUnknownsCount,
      importantUnknownsCount: maturityResult.unknownCount,
      openContradictionsCount: maturityResult.openContradictionsCount,
      allowFinalize: maturityResult.allowFinalize,
      lastActivityAt: now,
      updatedAt: now,
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updatedSession);

    // Observability Logging (Silent)
    console.log(`[ORBITE_ENGINE] Tour ${updatedSession.questionCount} exécuté :`, {
      sessionId: session.id,
      questionTarget: questionTarget.axis,
      maturityStep: maturityResult.maturityStep,
      confirmedCount: maturityResult.confirmedCount,
      inferredCount: maturityResult.inferredCount,
      updatedSectionsCount,
    });

    const finalQuestion = parsed.question
      ? {
          ...parsed.question,
          targetAxis: questionTarget.axis,
        }
      : null;

    return {
      session: updatedSession,
      blueprint: updatedBlueprint,
      response: {
        ...parsed,
        turnImpact,
        questionTarget: { axis: questionTarget.axis, reason: questionTarget.reason },
      },
      activeQuestion: finalQuestion,
      questionTarget,
    };
  }

  async getBlueprint(projectId: EntityId): Promise<FunctionalBlueprint | null> {
    return this.repos.functionalBlueprints.getByProjectId(projectId);
  }

  async getAssertions(sessionId: EntityId): Promise<KnowledgeAssertion[]> {
    return this.repos.knowledgeAssertions.getBySessionId(sessionId);
  }

  async getMessages(sessionId: EntityId): Promise<ProductInterviewMessage[]> {
    return this.repos.productInterviewMessages.getBySessionId(sessionId);
  }

  async getContradictions(sessionId: EntityId): Promise<ProductInterviewContradiction[]> {
    return this.repos.productInterviewContradictions.getBySessionId(sessionId);
  }

  async confirmAssertion(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "CONFIRMED",
      updatedAt: new Date().toISOString(),
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async excludeAssertion(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "EXCLUDED",
      updatedAt: new Date().toISOString(),
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async deferAssertion(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "DEFERRED",
      updatedAt: new Date().toISOString(),
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async pauseSession(sessionId: EntityId): Promise<ProductInterviewSession> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");
    const updated: ProductInterviewSession = {
      ...session,
      status: "PAUSED",
      lastActivityAt: new Date().toISOString(),
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updated);
    return updated;
  }

  async finalizeSession(sessionId: EntityId): Promise<ProductInterviewSession> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");

    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(sessionId);
    const openBlocking = contradictions.filter((c) => c.status === "OPEN" && c.isBlocking);
    if (openBlocking.length > 0) {
      throw new Error(`Impossible de finaliser : ${openBlocking.length} contradiction(s) bloquante(s) ouverte(s).`);
    }

    const now = new Date().toISOString();
    const updated: ProductInterviewSession = {
      ...session,
      status: "FINALIZED",
      maturityStep: "READY",
      allowFinalize: true,
      lastActivityAt: now,
      finalizedAt: now,
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updated);
    return updated;
  }

  private async refreshSessionMaturity(sessionId: EntityId): Promise<void> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) return;
    const assertions = await this.repos.knowledgeAssertions.getBySessionId(sessionId);
    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(sessionId);

    const axisStates = evaluateAxes(assertions);
    const mat = computeMaturityFromAxes(axisStates, contradictions);

    const updated: ProductInterviewSession = {
      ...session,
      maturityStep: mat.maturityStep,
      blockingUnknownsCount: mat.blockingUnknownsCount,
      openContradictionsCount: mat.openContradictionsCount,
      allowFinalize: mat.allowFinalize,
      lastActivityAt: new Date().toISOString(),
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updated);
  }
}
