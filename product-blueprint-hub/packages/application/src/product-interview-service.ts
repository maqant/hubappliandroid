import {
  EntityId,
  ProductInterviewSession,
  KnowledgeAssertion,
  ProductInterviewMessage,
  FunctionalBlueprint,
  BlueprintSectionId,
  BlueprintSection,
  BLUEPRINT_SECTION_TITLES,
  computeMaturity,
  validateProductArchitectResponse,
  ProductArchitectResponse,
  ProductInterviewContradiction,
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
      blockingUnknownsCount: 0,
      importantUnknownsCount: 0,
      openContradictionsCount: 0,
      allowFinalize: false,
      startedAt: now,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    // 14 Blueprint Sections
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

    // If project has description/idea, create an initial assertion
    if (project?.description) {
      const assertion: KnowledgeAssertion = {
        id: `pi_assert_${Date.now()}_1` as EntityId,
        projectId,
        sessionId,
        sectionId: "ORIGINAL_INTUITION",
        statement: project.description,
        status: "INFERRED",
        source: "PROJECT_IDEA",
        confidence: 90,
        impactedSectionIds: ["ORIGINAL_INTUITION"],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await this.repos.knowledgeAssertions.save(assertion);
    }

    return { session, blueprint, isNew: true };
  }

  /**
   * Effectue un tour de conversation avec l'Architecte Produit.
   * Suit le pattern validate-then-commit : zéro écriture en base en cas de réponse IA invalide.
   */
  async processTurn(
    projectId: EntityId,
    userInput?: string
  ): Promise<{
    session: ProductInterviewSession;
    blueprint: FunctionalBlueprint;
    response: ProductArchitectResponse;
    activeQuestion: any | null;
  }> {
    const { session, blueprint } = await this.initSession(projectId);
    const assertions = await this.repos.knowledgeAssertions.getBySessionId(session.id);
    const messages = await this.repos.productInterviewMessages.getBySessionId(session.id);
    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(session.id);
    const project = await this.repos.projects.getById(projectId);

    // 1. Build Compact Context
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
      assertionsCount: assertions.length,
      assertions: assertions.slice(-10).map((a) => ({ id: a.id, sectionId: a.sectionId, statement: a.statement, status: a.status })),
      blueprintSummaries: Object.values(blueprint.sections).map((s) => ({ id: s.id, status: s.status, summary: s.summary })),
      openContradictions: contradictions.filter((c) => c.status === "OPEN").map((c) => c.subject),
      recentMessages: messages.slice(-6).map((m) => `${m.role}: ${m.content}`),
    };

    // 2. Prepare Prompt & Call Model Provider
    const activePromptTemplate = await this.repos.prompts.getActivePrompt("PRODUCT-INTERVIEW-ARCHITECT");
    const systemPrompt = activePromptTemplate?.systemPrompt || "Tu es l'Architecte Produit. Réponds avec un JSON valide respectant ProductArchitectResponse et une seule question.";

    const fullPrompt = `[CONTEXTE COMPACT]
${JSON.stringify(compactContext, null, 2)}

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

    // 3. Clean & Parse JSON Response
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

    // 4. Validate ProductArchitectResponse (Validate-Then-Commit)
    const val = validateProductArchitectResponse(parsed);
    if (!val.valid) {
      throw new Error(`Contrat IA violé : ${val.reason}`);
    }

    // 5. COMMIT TRANSACTIONNEL (Validate-Then-Commit)
    const now = new Date().toISOString();

    // a. Record user message if provided
    if (userInput && userInput.trim().length > 0) {
      const userMsg: ProductInterviewMessage = {
        id: `pi_msg_user_${Date.now()}` as EntityId,
        sessionId: session.id,
        projectId,
        role: "USER",
        content: userInput.trim(),
        type: "ANSWER",
        createdAssertionIds: [],
        modifiedAssertionIds: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await this.repos.productInterviewMessages.save(userMsg);
    }

    // b. Record assistant message
    const createdAssertionIds: EntityId[] = [];
    const updatedSections: Record<BlueprintSectionId, BlueprintSection> = { ...blueprint.sections };

    // Process knowledgeUpdates
    if (Array.isArray(parsed.knowledgeUpdates)) {
      for (const ku of parsed.knowledgeUpdates) {
        if (ku.statement && ku.sectionId) {
          const assId = `pi_assert_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` as EntityId;
          const assertion: KnowledgeAssertion = {
            id: assId,
            projectId,
            sessionId: session.id,
            sectionId: ku.sectionId,
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

    // Process blueprintUpdates
    if (Array.isArray(parsed.blueprintUpdates)) {
      for (const bu of parsed.blueprintUpdates) {
        if (bu.id && updatedSections[bu.id as BlueprintSectionId]) {
          const currentSec = updatedSections[bu.id as BlueprintSectionId]!;
          updatedSections[bu.id as BlueprintSectionId] = {
            ...currentSec,
            summary: bu.summary || currentSec.summary,
            status: bu.status || currentSec.status,
            lastUpdatedAt: now,
            version: currentSec.version + 1,
          };
        }
      }
    }

    // Save assistant message
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

    // c. Save updated blueprint
    const updatedBlueprint: FunctionalBlueprint = {
      ...blueprint,
      sections: updatedSections,
      updatedAt: now,
      version: blueprint.version + 1,
    };
    await this.repos.functionalBlueprints.save(updatedBlueprint);

    // d. Update session state
    const updatedSession: ProductInterviewSession = {
      ...session,
      status: parsed.nextState || "WAITING_FOR_USER",
      maturityStep: parsed.readiness?.maturityStep || session.maturityStep,
      activeQuestionId: parsed.question ? (parsed.question.id as EntityId) : null,
      questionCount: session.questionCount + (parsed.question ? 1 : 0),
      blockingUnknownsCount: parsed.readiness?.blockingUnknownsCount ?? session.blockingUnknownsCount,
      importantUnknownsCount: parsed.readiness?.importantUnknownsCount ?? session.importantUnknownsCount,
      openContradictionsCount: parsed.readiness?.blockingContradictionsCount ?? session.openContradictionsCount,
      allowFinalize: parsed.readiness?.canFinalize ?? session.allowFinalize,
      lastActivityAt: now,
      updatedAt: now,
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updatedSession);

    return {
      session: updatedSession,
      blueprint: updatedBlueprint,
      response: parsed,
      activeQuestion: parsed.question || null,
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
    const blueprint = await this.repos.functionalBlueprints.getBySessionId(sessionId);
    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(sessionId);

    const mat = computeMaturity(assertions, blueprint?.sections || ({} as any), contradictions);
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
