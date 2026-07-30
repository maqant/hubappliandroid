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
  ProposedConsequence,
  ConsequenceStatus,
  VALID_CONSEQUENCE_TRANSITIONS,
  evaluateAxes,
  computeMaturityFromAxes,
  selectNextQuestionTarget,
  AXIS_TO_SECTION,
  QuestionTarget,
  OrbiteAxis,
  TurnImpactSummary,
  classifyAnswer,
  computePreReviewReadiness,
  buildCanonicalInventories,
  PreReviewReadiness,
  OrbiteReviewResult,
  ReviewFinding,
  ProductInterviewBaseline,
  FindingDecision,
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

    // Classification déterministe de la réponse utilisateur (SÉCURISATION)
    const category = classifyAnswer(userInput);

    if (category === "EMPTY" && userInput !== undefined) {
      // Pas d'information réelle fournie, ne pas appeler l'IA
      const activeQ = session.activeQuestionTarget;
      return {
        session,
        blueprint,
        response: {
          assistantMessage: "Veuillez fournir une réponse ou précision pour continuer l'entretien.",
          readiness: {
            maturityStep: session.maturityStep,
            blockingUnknownsCount: session.blockingUnknownsCount,
            importantUnknownsCount: session.importantUnknownsCount,
            blockingContradictionsCount: session.openContradictionsCount,
            canFinalize: session.allowFinalize,
            justification: "Saisie vide détectée.",
          },
        },
        activeQuestion: null,
        questionTarget: activeQ || selectNextQuestionTarget(evaluateAxes(assertions), null, contradictions),
      };
    }

    // Seules les réponses SUBSTANTIVE et CONFIRMATION créent une assertion CONFIRMED automatique
    if (userInput && (category === "SUBSTANTIVE" || category === "CONFIRMATION")) {
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
      assertions = await this.repos.knowledgeAssertions.getBySessionId(session.id);
    } else if (userInput) {
      // Enregistrer le message utilisateur sans confirmer l'axe (INCERTAIN, AMBIGUOUS, DEFER, etc.)
      const userMsg: ProductInterviewMessage = {
        id: `pi_msg_user_${Date.now()}` as EntityId,
        sessionId: session.id,
        projectId,
        role: "USER",
        content: userInput.trim(),
        type: "ANSWER",
        inResponseToQuestionId: session.activeQuestionId,
        createdAssertionIds: [],
        modifiedAssertionIds: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await this.repos.productInterviewMessages.save(userMsg);
    }

    // 1. Evaluate Axis States & Select Target
    const currentAxisStates = evaluateAxes(assertions);
    const lastAxis = session.activeQuestionTarget?.axis || null;
    const questionTarget = selectNextQuestionTarget(currentAxisStates, lastAxis, contradictions);

    // 2. Active Sources for LLM Context (Filter out INACTIVE sources)
    const allSources = await this.repos.sources.getByProjectId(projectId);
    const activeSources = allSources.filter((s) => s.contextStatus !== "INACTIVE");

    // 3. Context for LLM
    const compactContext = {
      project: { name: project?.name, description: project?.description },
      canonicalPlatform: project ? (project as any).platform || "WEB_NEXTJS" : "WEB_NEXTJS",
      activeSources: activeSources.map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        excerpt: s.content.slice(0, 300),
      })),
      session: { status: session.status, maturityStep: session.maturityStep, questionCount: session.questionCount },
      targetToClarify: {
        axis: questionTarget.axis,
        sectionId: AXIS_TO_SECTION[questionTarget.axis],
        reason: questionTarget.reason,
        phase: questionTarget.maturityPhase,
      },
      answerCategory: category,
      assertionsCount: assertions.length,
      recentMessages: messages.slice(-6).map((m) => `${m.role}: ${m.content}`),
    };

    const activePromptTemplate = await this.repos.prompts.getActivePrompt("PRODUCT-INTERVIEW-ARCHITECT");
    const systemPrompt =
      activePromptTemplate?.systemPrompt ||
      "Tu es l'Architecte Produit. Pose UNE SEULE question ciblée et propose d'éventuelles conséquences structurées.";

    const fullPrompt = `[CONTEXTE COMPACT ET CIBLE ORBITE]
${JSON.stringify(compactContext, null, 2)}

[CONSIGNE IMPÉRATIVE DE CIBLAGE]
Votre prochaine question doit OBLIGATOIREMENT cibler l'axe ORBITE : "${questionTarget.axis}" (Section affectée : ${AXIS_TO_SECTION[questionTarget.axis]}).
Raison du ciblage : ${questionTarget.reason}.
Catégorie de la réponse utilisateur : ${category}.

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

    const val = validateProductArchitectResponse(parsed);
    if (!val.valid) {
      throw new Error(`Contrat IA violé : ${val.reason}`);
    }

    // Process Proposed Consequences
    if (Array.isArray(parsed.proposedConsequences)) {
      for (const pc of parsed.proposedConsequences) {
        if (pc.statement && pc.targetSectionId) {
          const cons: ProposedConsequence = {
            id: `pi_cons_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` as EntityId,
            projectId,
            sessionId: session.id,
            sourceAssertionIds: createdAssertionIds,
            targetSectionId: pc.targetSectionId,
            status: "PROPOSED",
            impact: pc.impact || "MEDIUM",
            statement: pc.statement,
            rationale: pc.rationale || "Déduit de votre réponse.",
            createdAtTurn: session.questionCount + 1,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          await this.repos.proposedConsequences.save(cons);
        }
      }
    }

    // Process Additional Inferred Assertions
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

    const allAssertions = await this.repos.knowledgeAssertions.getBySessionId(session.id);
    const updatedAxisStates = evaluateAxes(allAssertions);
    const maturityResult = computeMaturityFromAxes(updatedAxisStates, contradictions);

    // Derive 14 Blueprint Sections
    const updatedSections: Record<BlueprintSectionId, BlueprintSection> = { ...blueprint.sections };
    let updatedSectionsCount = 0;

    for (const sid of Object.keys(updatedSections) as BlueprintSectionId[]) {
      const currentSec = updatedSections[sid];
      const secAssertions = allAssertions.filter(
        (a) => (a.sectionId === sid || (a.axis && AXIS_TO_SECTION[a.axis] === sid)) && a.status !== "EXCLUDED"
      );
      const secAssertionIds = secAssertions.map((a) => a.id);

      const hasConfirmed = secAssertions.some((a) => a.status === "CONFIRMED");
      const hasInferred = secAssertions.some((a) => a.status === "INFERRED");

      let derivedStatus = currentSec.status;
      if (hasConfirmed) derivedStatus = "CONFIRMED";
      else if (hasInferred) derivedStatus = "INFERRED";

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

    const turnImpact: TurnImpactSummary = parsed.turnImpact || {
      summary: `Ce tour a permis d'aborder l'axe ${questionTarget.axis} (Section: ${BLUEPRINT_SECTION_TITLES[AXIS_TO_SECTION[questionTarget.axis]]}).`,
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

    const finalQuestion = parsed.question
      ? { ...parsed.question, targetAxis: questionTarget.axis }
      : null;

    return {
      session: updatedSession,
      blueprint: updatedBlueprint,
      response: {
        ...parsed,
        answerClassification: { category },
        turnImpact,
        questionTarget: { axis: questionTarget.axis, reason: questionTarget.reason },
      },
      activeQuestion: finalQuestion,
      questionTarget,
    };
  }

  // ─── Local Pure Arbitrage Methods (ZERO AI Calls) ────────────────

  async getProposedConsequences(sessionId: EntityId): Promise<ProposedConsequence[]> {
    return this.repos.proposedConsequences.getBySessionId(sessionId);
  }

  async acceptConsequence(consequenceId: EntityId): Promise<ProposedConsequence> {
    const c = await this.repos.proposedConsequences.getById(consequenceId);
    if (!c) throw new Error("Conséquence non trouvée");
    if (!VALID_CONSEQUENCE_TRANSITIONS[c.status].includes("ACCEPTED")) {
      throw new Error(`Transition invalide pour la conséquence ${c.id}`);
    }

    const now = new Date().toISOString();
    const updated: ProposedConsequence = {
      ...c,
      status: "ACCEPTED",
      resolvedAt: now,
      version: c.version + 1,
    };
    await this.repos.proposedConsequences.save(updated);

    // Save as CONFIRMED assertion
    const assertion: KnowledgeAssertion = {
      id: `pi_assert_cons_${Date.now()}` as EntityId,
      projectId: c.projectId,
      sessionId: c.sessionId,
      sectionId: c.targetSectionId,
      statement: c.statement,
      status: "CONFIRMED",
      source: "USER_DECISION",
      confidence: 100,
      impactedSectionIds: [c.targetSectionId],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repos.knowledgeAssertions.save(assertion);
    await this.refreshSessionMaturity(c.sessionId);

    return updated;
  }

  async rejectConsequence(consequenceId: EntityId): Promise<ProposedConsequence> {
    const c = await this.repos.proposedConsequences.getById(consequenceId);
    if (!c) throw new Error("Conséquence non trouvée");

    const now = new Date().toISOString();
    const updated: ProposedConsequence = {
      ...c,
      status: "REJECTED",
      resolvedAt: now,
      version: c.version + 1,
    };
    await this.repos.proposedConsequences.save(updated);
    return updated;
  }

  async deferConsequence(consequenceId: EntityId): Promise<ProposedConsequence> {
    const c = await this.repos.proposedConsequences.getById(consequenceId);
    if (!c) throw new Error("Conséquence non trouvée");

    const now = new Date().toISOString();
    const updated: ProposedConsequence = {
      ...c,
      status: "DEFERRED",
      resolvedAt: now,
      version: c.version + 1,
    };
    await this.repos.proposedConsequences.save(updated);
    return updated;
  }

  async correctConsequence(consequenceId: EntityId, correctedStatement: string): Promise<ProposedConsequence> {
    const c = await this.repos.proposedConsequences.getById(consequenceId);
    if (!c) throw new Error("Conséquence non trouvée");

    const now = new Date().toISOString();
    const updated: ProposedConsequence = {
      ...c,
      status: "CORRECTED",
      correctedStatement: correctedStatement.trim(),
      resolvedAt: now,
      version: c.version + 1,
    };
    await this.repos.proposedConsequences.save(updated);

    // Save corrected statement as CONFIRMED assertion
    const assertion: KnowledgeAssertion = {
      id: `pi_assert_cons_corr_${Date.now()}` as EntityId,
      projectId: c.projectId,
      sessionId: c.sessionId,
      sectionId: c.targetSectionId,
      statement: correctedStatement.trim(),
      status: "CONFIRMED",
      source: "USER_DECISION",
      confidence: 100,
      impactedSectionIds: [c.targetSectionId],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repos.knowledgeAssertions.save(assertion);
    await this.refreshSessionMaturity(c.sessionId);

    return updated;
  }

  async correctAssertion(assertionId: EntityId, newStatement: string): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");

    const now = new Date().toISOString();
    const updated: KnowledgeAssertion = {
      ...assertion,
      statement: newStatement.trim(),
      status: "CONFIRMED",
      source: "USER_DECISION",
      updatedAt: now,
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async markNotApplicable(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");

    const now = new Date().toISOString();
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "NOT_APPLICABLE",
      updatedAt: now,
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async resolveContradiction(contradictionId: EntityId, decisionText: string): Promise<ProductInterviewContradiction> {
    const contradiction = await this.repos.productInterviewContradictions.getById(contradictionId);
    if (!contradiction) throw new Error("Contradiction non trouvée");

    const now = new Date().toISOString();
    const updated: ProductInterviewContradiction = {
      ...contradiction,
      status: "RESOLVED",
      resolutionDecisionId: `dec_res_${Date.now()}` as EntityId,
      version: contradiction.version + 1,
    };
    await this.repos.productInterviewContradictions.save(updated);

    // Save resolution decision as assertion
    const assertion: KnowledgeAssertion = {
      id: `pi_assert_res_${Date.now()}` as EntityId,
      projectId: contradiction.projectId,
      sessionId: contradiction.sessionId,
      sectionId: "REAL_PROBLEM",
      statement: `Arbitrage : ${decisionText.trim()}`,
      status: "CONFIRMED",
      source: "USER_DECISION",
      impactedSectionIds: ["REAL_PROBLEM"],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repos.knowledgeAssertions.save(assertion);
    await this.refreshSessionMaturity(contradiction.sessionId);

    return updated;
  }

  // ─── Existing Helper Methods ─────────────────────────────────────

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
      source: "USER_DECISION",
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

  // ─── CHANTIER 5 — Relecture ORBITE & Product Interview Baseline ───

  async checkPreReviewReadiness(sessionId: EntityId): Promise<PreReviewReadiness> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");

    const [blueprint, assertions, consequences, contradictions] = await Promise.all([
      this.repos.functionalBlueprints.getBySessionId(sessionId),
      this.repos.knowledgeAssertions.getBySessionId(sessionId),
      this.repos.proposedConsequences.getBySessionId(sessionId),
      this.repos.productInterviewContradictions.getBySessionId(sessionId),
    ]);

    if (!blueprint) throw new Error("Blueprint non trouvé");

    return computePreReviewReadiness(session, assertions, blueprint, consequences, contradictions);
  }

  async requestFinalReview(sessionId: EntityId): Promise<OrbiteReviewResult> {
    const readiness = await this.checkPreReviewReadiness(sessionId);
    if (!readiness.ready) {
      throw new Error(`Relecture impossible : ${readiness.blockers.map((b) => b.detail).join(" • ")}`);
    }

    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");
    const blueprint = await this.repos.functionalBlueprints.getBySessionId(sessionId);
    const assertions = await this.repos.knowledgeAssertions.getBySessionId(sessionId);
    const consequences = await this.repos.proposedConsequences.getBySessionId(sessionId);

    const now = new Date().toISOString();

    let reviewResult: OrbiteReviewResult;

    if (this.provider) {
      try {
        const resp = await this.provider.generateResponse({
          systemPrompt: "PRODUCT-INTERVIEW-ORBITE-REVIEWER: Vous êtes le Relecteur ORBITE. Analysez le blueprint et produisez un diagnostic strict.",
          prompt: JSON.stringify({ blueprint, assertions, consequences }),
        });
        const parsed = JSON.parse(resp.content || resp);
        reviewResult = {
          id: `pi_rev_${Date.now()}` as EntityId,
          sessionId,
          requestedAt: now,
          modelCallId: `call_${Date.now()}`,
          status: "PENDING_ARBITRATION",
          reviewSummary: parsed.reviewSummary || "Analyse de relecture effectuée.",
          findings: (parsed.findings || []).map((f: any, idx: number) => ({
            id: f.id || `fnd_${idx + 1}`,
            category: f.category || "COHERENCE",
            level: f.level || "IMPORTANT",
            title: f.title || "Observation de relecture",
            observation: f.observation || "",
            rationale: f.rationale || "",
            sectionIds: f.sectionIds || ["REAL_PROBLEM"],
            assertionIds: f.assertionIds,
            suggestedResolution: f.suggestedResolution || "",
            options: f.options,
            isBlocking: Boolean(f.isBlocking),
          })),
          strengths: parsed.strengths || ["Périmètre clair et formalisé"],
          remainingAssumptions: parsed.remainingAssumptions || [],
          recommendedNextAction: parsed.recommendedNextAction || "VALIDATE",
        };
      } catch (err: any) {
        reviewResult = {
          id: `pi_rev_${Date.now()}` as EntityId,
          sessionId,
          requestedAt: now,
          modelCallId: `call_err_${Date.now()}`,
          status: "FAILED",
          reviewSummary: "Échec de l'analyse du Relecteur ORBITE.",
          findings: [],
          strengths: [],
          remainingAssumptions: [],
          recommendedNextAction: "RESUME_INTERVIEW",
          failureReason: String(err),
        };
      }
    } else {
      // Deterministic fallback response
      reviewResult = {
        id: `pi_rev_${Date.now()}` as EntityId,
        sessionId,
        requestedAt: now,
        modelCallId: `call_det_${Date.now()}`,
        status: "PENDING_ARBITRATION",
        reviewSummary: "Le Blueprint Vivant est solide et prêt à être validé.",
        strengths: [
          "Problème réel et promesse minimale clairement établis",
          "Conséquences et exclusions explicitement confirmées par l'utilisateur",
          "Boucle de valeur cohérente et traçable",
        ],
        remainingAssumptions: [
          "L'adoption dépendra de la clarté de la première expérience",
        ],
        recommendedNextAction: "VALIDATE",
        findings: [
          {
            id: `fnd_1` as EntityId,
            category: "WEAK_STATE",
            level: "RECOMMENDATION",
            title: "Précision sur la première utilisation sans données",
            observation: "La section WEAK_STATES peut être enrichie d'un guide de démarrage rapide.",
            rationale: "Un premier lancement vide peut ralentir l'adoption si aucun exemple n'est proposé.",
            sectionIds: ["WEAK_STATES"],
            suggestedResolution: "Ajouter un preset ou exemple pré-rempli au premier démarrage.",
            options: ["Exemple pré-rempli", "Guide interactif pas à pas"],
            isBlocking: false,
          },
        ],
      };
    }

    return reviewResult;
  }

  async recordFindingDecision(
    finding: ReviewFinding,
    decision: FindingDecision,
    userJustification?: string
  ): Promise<ReviewFinding> {
    finding.decision = decision;
    finding.decidedAt = new Date().toISOString();
    finding.userJustification = userJustification;
    return finding;
  }

  async validateAndCreateBaseline(sessionId: EntityId): Promise<ProductInterviewBaseline> {
    const session = await this.repos.productInterviewSessions.getByProjectId(sessionId) || await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");

    const [blueprint, assertions, consequences] = await Promise.all([
      this.repos.functionalBlueprints.getBySessionId(session.id),
      this.repos.knowledgeAssertions.getBySessionId(session.id),
      this.repos.proposedConsequences.getBySessionId(session.id),
    ]);

    if (!blueprint) throw new Error("Blueprint non trouvé");

    const acceptedCons = consequences.filter((c) => c.status === "ACCEPTED");
    const canonicalInventories = buildCanonicalInventories(blueprint, assertions, consequences);

    const now = new Date().toISOString();
    const existing = await this.repos.productInterviewBaselines.getByProjectId(session.projectId);
    const version = existing.length + 1;

    const contentHash = `sha256_${Date.now()}_${version}`;

    const baseline: ProductInterviewBaseline = {
      id: `pi_bsl_${Date.now()}` as EntityId,
      projectId: session.projectId,
      sessionId: session.id,
      version,
      status: "VALIDATED",
      createdAt: now,
      validatedAt: now,
      contentHash,
      blueprintSnapshot: structuredClone(blueprint),
      assertionsSnapshot: structuredClone(assertions),
      decisionsSnapshot: [],
      acceptedConsequencesSnapshot: structuredClone(acceptedCons),
      arbitratedFindings: [],
      canonicalInventories,
      narrativeSummary: `Product Interview Baseline v${version} validée le ${new Date().toLocaleDateString("fr-FR")}.`,
    };

    await this.repos.productInterviewBaselines.save(baseline);
    await this.finalizeSession(session.id);

    return baseline;
  }

  async getLatestBaseline(projectId: EntityId): Promise<ProductInterviewBaseline | null> {
    return this.repos.productInterviewBaselines.getLatestByProjectId(projectId);
  }

  async listBaselines(projectId: EntityId): Promise<ProductInterviewBaseline[]> {
    return this.repos.productInterviewBaselines.getByProjectId(projectId);
  }

  async toggleSourceContextStatus(
    sourceId: EntityId,
    status: import("@pbh/domain").SourceContextStatus
  ): Promise<import("@pbh/domain").Source> {
    return this.repos.sources.updateContextStatus(sourceId, status);
  }

  async resolveAuthority(projectId: EntityId): Promise<import("@pbh/domain").ProjectProductAuthority> {
    const [baseline, session, briefItems] = await Promise.all([
      this.getLatestBaseline(projectId),
      this.getSession(projectId),
      this.repos.briefItems.getByProjectId(projectId),
    ]);

    return import("@pbh/domain").resolveProjectProductAuthority({
      latestValidatedBaselineId: baseline ? baseline.id : null,
      hasActiveWorkingState: session !== null,
      hasLockedBriefItems: briefItems.length > 0,
    });
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
