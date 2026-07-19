import type { IModelProvider, ModelRequest, ModelResponse } from "./gateway";

// ============================================
// FakeModelProvider — deterministic, no network
// ============================================

/**
 * Deterministic model provider for demo mode.
 * Responses depend on input content via simple hashing.
 * No network calls are made.
 */
export class FakeModelProvider implements IModelProvider {
  readonly name = "fake";
  readonly isConfigured = true;

  private static scenario: "DEMO_PASSING" | "DEMO_BLOCKING" = "DEMO_PASSING";
  private static delayMode: "instant" | "demo" = "demo";

  static setScenario(scenario: "DEMO_PASSING" | "DEMO_BLOCKING") {
    FakeModelProvider.scenario = scenario;
  }

  static setDelayMode(mode: "instant" | "demo") {
    FakeModelProvider.delayMode = mode;
  }

  static getScenario(): "DEMO_PASSING" | "DEMO_BLOCKING" {
    if (typeof window !== "undefined") {
      const val = window.localStorage.getItem("DEMO_MODE_SCENARIO");
      if (val === "DEMO_PASSING" || val === "DEMO_BLOCKING") {
        return val;
      }
    }
    if (typeof process !== "undefined" && process.env.DEMO_MODE_SCENARIO) {
      const val = process.env.DEMO_MODE_SCENARIO;
      if (val === "DEMO_PASSING" || val === "DEMO_BLOCKING") {
        return val;
      }
    }
    return FakeModelProvider.scenario;
  }

  static getDelayMode(): "instant" | "demo" {
    if (typeof window !== "undefined") {
      const val = window.localStorage.getItem("FAKE_PROVIDER_DELAY_MODE");
      if (val === "instant" || val === "demo") {
        return val;
      }
    }
    if (typeof process !== "undefined" && process.env.FAKE_PROVIDER_DELAY_MODE) {
      const val = process.env.FAKE_PROVIDER_DELAY_MODE;
      if (val === "instant" || val === "demo") {
        return val;
      }
    }
    return FakeModelProvider.delayMode;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    const delayMode = FakeModelProvider.getDelayMode();
    let delay = 0;
    if (delayMode === "demo") {
      delay = request.tier === "SOL" ? 800 : request.tier === "TERRA" ? 400 : 200;
    }
    if (delay > 0) {
      await sleep(delay);
    }

    const content = this.generateResponse(request);
    const tokensUsed = Math.ceil(content.length / 4);

    return {
      content,
      tokensUsed,
      modelId: `fake-${request.tier.toLowerCase()}`,
      tier: request.tier,
      provider: "fake",
      durationMs: Date.now() - start,
      correlationId: request.correlationId,
    };
  }

  async checkHealth(): Promise<{ status: "ok" | "error"; message: string }> {
    return { status: "ok", message: "FakeModelProvider is always available" };
  }

  private generateResponse(request: ModelRequest): string {
    const prompt = request.prompt;
    const sys = (request.systemPrompt ?? "").toLowerCase();

    // Brief analysis
    if (sys.includes("analyze") || sys.includes("brief")) {
      return this.generateBriefAnalysis(request.prompt);
    }

    // Blueprint generation
    if (sys.includes("blueprint") || sys.includes("generate")) {
      return this.generateBlueprintSection(prompt);
    }

    // Audit
    if (sys.includes("audit")) {
      return this.generateAuditResponse(prompt);
    }

    // Conflict detection
    if (sys.includes("conflict")) {
      return this.generateConflictResponse(prompt);
    }

    // Agent planning
    if (sys.includes("plan") || sys.includes("agent")) {
      return this.generatePlanResponse(prompt);
    }

    // Default structured response
    return JSON.stringify({
      analysis: "Deterministic analysis of the provided content.",
      recommendations: [
        "Consider the primary user needs identified in the brief.",
        "Ensure accessibility requirements are addressed.",
        "Validate technical feasibility of proposed architecture.",
      ],
      confidence: 0.85,
    });
  }

  private generateBriefAnalysis(prompt: string): string {
    const isFr = prompt.match(/[a-zÀ-ÿ]+/i)
      ? prompt.includes("le ") ||
        prompt.includes("la ") ||
        prompt.includes("projet ") ||
        prompt.includes("vêtement") ||
        prompt.includes("recette") ||
        prompt.includes("tâche") ||
        prompt.includes("pour") ||
        prompt.includes("avec") ||
        prompt.includes("est")
      : false;

    const trimmed = prompt.trim();

    // Test négatif : texte très court et ambigu
    if (
      trimmed.length < 20 ||
      trimmed.toLowerCase() === "bonjour" ||
      trimmed.toLowerCase() === "aide" ||
      trimmed.toLowerCase() === "help"
    ) {
      const items = [
        {
          type: "QUESTION",
          statement: isFr
            ? "Quel est l'objectif principal et la vision de votre projet applicatif ?"
            : "What is the main objective and vision of your application project?",
          confidence: 0.99,
          excerpt: trimmed || "Texte trop court et ambigu",
        },
        {
          type: "QUESTION",
          statement: isFr
            ? "Quels sont les utilisateurs cibles et leurs besoins essentiels ?"
            : "Who are the target users and their essential needs?",
          confidence: 0.95,
          excerpt: trimmed || "Texte trop court et ambigu",
        },
      ];
      return JSON.stringify({
        items,
        error: isFr
          ? "Informations insuffisantes pour concevoir un produit complet. Veuillez préciser votre idée."
          : "Insufficient information to design a complete product. Please specify your idea.",
      });
    }

    // Découper le prompt en phrases significatives
    const rawPhrases = prompt
      .split(/[.\n?!;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 5);
    const items: any[] = [];

    // Détermination du terme du domaine
    const lowercasePrompt = trimmed.toLowerCase();
    let domainTerm = isFr ? "l'application" : "the application";
    if (
      lowercasePrompt.includes("vêtement") ||
      lowercasePrompt.includes("garde-robe") ||
      lowercasePrompt.includes("wardrobe") ||
      lowercasePrompt.includes("clothing")
    ) {
      domainTerm = isFr ? "la garde-robe intelligente" : "the smart wardrobe";
    } else if (
      lowercasePrompt.includes("recette") ||
      lowercasePrompt.includes("cuisine") ||
      lowercasePrompt.includes("recipe")
    ) {
      domainTerm = isFr ? "le carnet de recettes" : "the recipe book";
    } else if (
      lowercasePrompt.includes("tâche") ||
      lowercasePrompt.includes("task") ||
      lowercasePrompt.includes("todo")
    ) {
      domainTerm = isFr ? "le gestionnaire de tâches" : "the task manager";
    }

    // Classer les phrases selon leur formulation
    for (const phrase of rawPhrases) {
      const lower = phrase.toLowerCase();

      // Pas d'invention de budget, délai, volumétrie ou API sauf si spécifié
      let type = "VISION";
      if (
        lower.includes("exclure") ||
        lower.includes("hors périmètre") ||
        lower.includes("not include") ||
        lower.includes("exclude") ||
        lower.includes("pas dans le mvp")
      ) {
        type = "CONSTRAINT"; // Classé comme exclusion / contrainte
      } else if (
        lower.includes("faut-il") ||
        lower.includes("est-ce que") ||
        lower.includes("?") ||
        lower.includes("comment") ||
        lower.includes("why") ||
        lower.includes("how")
      ) {
        type = "QUESTION";
      } else if (
        lower.includes("doit") ||
        lower.includes("obligation") ||
        lower.includes("obligatoire") ||
        lower.includes("must") ||
        lower.includes("required") ||
        lower.includes("il faut") ||
        lower.includes("devra")
      ) {
        type = "CONSTRAINT";
      } else if (
        lower.includes("utilisateur") ||
        lower.includes("utilisateurs") ||
        lower.includes("user") ||
        lower.includes("users") ||
        lower.includes("client") ||
        lower.includes("veut") ||
        lower.includes("besoin")
      ) {
        type = "USER_NEED";
      } else if (
        lower.includes("risque") ||
        lower.includes("risk") ||
        lower.includes("danger") ||
        lower.includes("menace")
      ) {
        type = "RISK";
      } else if (
        lower.includes("suppose") ||
        lower.includes("hypothèse") ||
        lower.includes("assum") ||
        lower.includes("part du principe")
      ) {
        type = "ASSUMPTION";
      } else if (
        lower.includes("objectif") ||
        lower.includes("but") ||
        lower.includes("permettre") ||
        lower.includes("in order to") ||
        lower.includes("aims")
      ) {
        type = "OBJECTIVE";
      } else if (
        lower.includes("décide") ||
        lower.includes("décision") ||
        lower.includes("decide") ||
        lower.includes("decision") ||
        lower.includes("on choisit")
      ) {
        type = "DECISION";
      } else if (
        lower.includes("exemple") ||
        lower.includes("par exemple") ||
        lower.includes("comme")
      ) {
        type = "EXAMPLE";
      } else {
        type = "VISION";
      }

      items.push({
        type,
        statement: phrase, // exigence source exacte
        confidence: 0.9,
        excerpt: phrase, // traçabilité exacte
      });
    }

    // Ajouter des suggestions (clairement étiquetées comme suggestions, et jamais présentées comme des exigences sources !)
    if (isFr) {
      items.push({
        type: "SUGGESTION",
        statement: `[SUGGESTION] Envisager d'ajouter un module d'exportation pour sauvegarder les données de ${domainTerm}.`,
        confidence: 0.8,
        excerpt: "Suggestion d'évolution future (hors brief source)",
      });
      items.push({
        type: "SUGGESTION",
        statement: `[SUGGESTION] Proposer un mode hors-ligne complet pour faciliter l'accès à ${domainTerm}.`,
        confidence: 0.75,
        excerpt: "Suggestion d'évolution future (hors brief source)",
      });
    } else {
      items.push({
        type: "SUGGESTION",
        statement: `[SUGGESTION] Consider adding an export feature to save ${domainTerm} data.`,
        confidence: 0.8,
        excerpt: "Future evolution suggestion (outside source brief)",
      });
      items.push({
        type: "SUGGESTION",
        statement: `[SUGGESTION] Offer a full offline mode to enhance usability for ${domainTerm}.`,
        confidence: 0.75,
        excerpt: "Future evolution suggestion (outside source brief)",
      });
    }

    return JSON.stringify({ items });
  }

  private generateBlueprintSection(prompt: string): string {
    const sections: import("@pbh/domain").BlueprintSection[] = [
      "PRODUCT_VISION",
      "USERS_NEEDS",
      "MVP_SCOPE",
      "USER_JOURNEYS",
      "SCREEN_MAP",
      "DESIGN_SYSTEM",
      "FUNCTIONAL_RULES",
      "DATA_MODEL",
      "ARCHITECTURE",
      "API_CONTRACTS",
      "AI_ARCHITECTURE",
      "SECURITY_PRIVACY",
      "DEPLOYMENT",
      "BACKLOG",
      "TEST_PLAN",
      "DECISION_REGISTER",
      "TRACEABILITY_MATRIX",
    ];
    const sectionKey = sections.find((s) => prompt.toUpperCase().includes(s)) || "PRODUCT_VISION";
    return this.generateBlueprintSectionData(prompt, sectionKey);
  }

  private generateBlueprintSectionData(prompt: string, sectionKey: string): string {
    const isFr =
      prompt.toLowerCase().includes("context:") ||
      prompt.includes("le ") ||
      prompt.includes("la ") ||
      prompt.includes("projet") ||
      prompt.includes("garde-robe") ||
      prompt.includes("recette") ||
      prompt.includes("tâche") ||
      prompt.includes("pour");

    // Extraction des LOCKED references
    const lockedLines: string[] = [];
    const lockedRegex = /- \[([A-Z_]+)\] ([^\n]+)/g;
    let match;
    while ((match = lockedRegex.exec(prompt)) !== null) {
      if (match[2]) {
        lockedLines.push(`[${match[1]}] ${match[2]}`);
      }
    }

    // Extraction des decisions
    const decisionLines: string[] = [];
    const decisionRegex = /- \[DECISION\] ([^\n]+)/g;
    while ((match = decisionRegex.exec(prompt)) !== null) {
      if (match[1]) {
        decisionLines.push(match[1]);
      }
    }

    // Déterminons le sujet du projet
    let subject = isFr ? "l'application" : "the application";
    if (
      prompt.toLowerCase().includes("garde-robe") ||
      prompt.toLowerCase().includes("wardrobe") ||
      prompt.toLowerCase().includes("vêtement") ||
      prompt.toLowerCase().includes("clothing")
    ) {
      subject = isFr ? "la garde-robe intelligente" : "the smart wardrobe";
    } else if (
      prompt.toLowerCase().includes("recette") ||
      prompt.toLowerCase().includes("cuisine") ||
      prompt.toLowerCase().includes("recipe")
    ) {
      subject = isFr ? "le carnet de recettes" : "the recipe book";
    } else if (
      prompt.toLowerCase().includes("tâche") ||
      prompt.toLowerCase().includes("task") ||
      prompt.toLowerCase().includes("todo")
    ) {
      subject = isFr ? "le gestionnaire de tâches" : "the task manager";
    }

    const title = isFr
      ? `Spécifications de la section ${sectionKey.replace("_", " ")} — ${subject}`
      : `Specifications for ${sectionKey.replace("_", " ")} — ${subject}`;

    // Construire le contenu et les sections dynamiquement à partir des LOCKED items et Decisions !
    const content = isFr
      ? `Cette section documente les spécifications techniques et fonctionnelles pour la section ${sectionKey} relatives à ${subject}. Elle synthétise l'ensemble des règles de gestion et d'architecture arrêtées.`
      : `This section documents the technical and functional specifications for ${sectionKey} related to ${subject}. It synthesizes all approved management rules and architecture details.`;

    const subSections: any[] = [];

    if (lockedLines.length > 0) {
      subSections.push({
        heading: isFr ? "Exigences du Brief Validées" : "Validated Brief Requirements",
        body: isFr
          ? `Les exigences sources suivantes ont été analysées et intégrées pour cette section :\n${lockedLines.map((l) => `- ${l}`).join("\n")}`
          : `The following source requirements were analyzed and integrated for this section:\n${lockedLines.map((l) => `- ${l}`).join("\n")}`,
      });
    }

    if (decisionLines.length > 0) {
      subSections.push({
        heading: isFr ? "Décisions Prises" : "Decisions Made",
        body: isFr
          ? `Décisions d'architecture formalisées :\n${decisionLines.map((d) => `- ${d}`).join("\n")}`
          : `Formalized architecture decisions:\n${decisionLines.map((d) => `- ${d}`).join("\n")}`,
      });
    }

    // Sous-sections complémentaires selon la section
    if (sectionKey === "PRODUCT_VISION") {
      subSections.push({
        heading: isFr ? "Objectifs et Alignement" : "Objectives & Alignment",
        body: isFr
          ? `Garantir que le développement de ${subject} est parfaitement aligné avec la vision d'origine.`
          : `Ensure that the development of ${subject} aligns perfectly with the original vision.`,
      });
    } else if (sectionKey === "USERS_NEEDS") {
      subSections.push({
        heading: isFr ? "Profils Utilisateurs" : "User Profiles",
        body: isFr
          ? `Utilisateurs cibles de ${subject} recherchant une interface claire et réactive.`
          : `Target users of ${subject} looking for a clear and responsive interface.`,
      });
    } else if (sectionKey === "MVP_SCOPE") {
      subSections.push({
        heading: isFr ? "Fonctionnalités Clés et Limites" : "Key Features & Boundaries",
        body: isFr
          ? `Le périmètre MVP de ${subject} intègre uniquement les exigences stables listées ci-dessus.`
          : `The MVP scope of ${subject} includes only the stable requirements listed above.`,
      });
    } else {
      subSections.push({
        heading: isFr ? "Détails Techniques" : "Technical Details",
        body: isFr
          ? `Implémentation spécifique de ${sectionKey} répondant aux contraintes du projet.`
          : `Specific implementation of ${sectionKey} satisfying the project's constraints.`,
      });
    }

    return JSON.stringify({
      title,
      content,
      sections: subSections,
    });
  }

  private generateAuditResponse(prompt: string): string {
    const hash = simpleHash(prompt);
    const scenario = FakeModelProvider.getScenario();
    const findingCount = 3 + (hash % 3);
    const findings = [];

    if (scenario === "DEMO_BLOCKING") {
      // First finding is BLOCKING
      findings.push({
        title: `Constat 1 (Bloquant) : Donnée Sensible Exposée`,
        severity: "BLOCKING",
        description: `Une clé d'accès ou donnée confidentielle a été détectée en clair dans la description ou l'idée du projet. Le gèle est bloqué par sécurité.`,
        proof: "Chaîne de caractères correspondant au motif de sécurité critique.",
        impact: "Critique",
        correction: "Veuillez modifier le texte de l'idée pour masquer ou retirer les secrets.",
        allowedToProceed: false,
        auditType: "SECURITY",
      });

      // Rest are WARNING/INFO
      const severities = ["INFO", "WARNING"];
      for (let i = 1; i < findingCount; i++) {
        findings.push({
          title: `Constat ${i + 1} : Vérification automatique effectuée`,
          severity: severities[(hash + i) % severities.length],
          description: `Vérification automatique effectuée par le module d'audit technique (élément ${i + 1}).`,
          proof: "Analyse statistique de couverture des exigences.",
          impact: "Moyen",
          correction: "Mettre à jour la section correspondante dans le blueprint.",
          allowedToProceed: true,
          auditType: "QUALITY",
        });
      }
    } else {
      // DEMO_PASSING
      const severities = ["INFO", "WARNING"];
      for (let i = 0; i < findingCount; i++) {
        findings.push({
          title: `Constat ${i + 1} : Vérification automatique effectuée`,
          severity: severities[(hash + i) % severities.length],
          description: `Vérification automatique effectuée par le module d'audit technique (élément ${i + 1}).`,
          proof: "Analyse statistique de couverture des exigences.",
          impact: i === 0 ? "Moyen" : "Faible",
          correction: "Mettre à jour la section correspondante dans le blueprint.",
          allowedToProceed: true,
          auditType: "QUALITY",
        });
      }
    }

    return JSON.stringify({ findings });
  }

  private generateConflictResponse(prompt: string): string {
    const isFr =
      prompt.toLowerCase().includes("context:") ||
      prompt.includes("le ") ||
      prompt.includes("la ") ||
      prompt.includes("projet") ||
      prompt.includes("garde-robe") ||
      prompt.includes("recette") ||
      prompt.includes("tâche") ||
      prompt.includes("pour");
    return JSON.stringify({
      conflicts: [
        {
          title: isFr ? "Arbitrage : Périmètre vs Calendrier" : "Arbitrage: Scope vs Timeline",
          description: isFr
            ? "Le nombre de fonctionnalités demandées dépasse les capacités du calendrier MVP."
            : "The number of requested features exceeds the MVP timeline capacities.",
          options: [
            {
              id: "opt-scope",
              label: isFr ? "Réduire le périmètre" : "Reduce scope",
              description: isFr
                ? "Se concentrer uniquement sur les fonctions de base."
                : "Focus only on core features.",
              impact: isFr
                ? "Livraison rapide mais moins de fonctions."
                : "Fast delivery but fewer features.",
            },
            {
              id: "opt-timeline",
              label: isFr ? "Repousser la livraison" : "Delay delivery",
              description: isFr ? "Conserver l'ensemble du périmètre." : "Keep all scope.",
              impact: isFr ? "Produit complet mais retardé." : "Complete product but delayed.",
            },
          ],
        },
      ],
    });
  }

  private generatePlanResponse(prompt: string): string {
    const isFr =
      prompt.toLowerCase().includes("context:") ||
      prompt.includes("le ") ||
      prompt.includes("la ") ||
      prompt.includes("projet") ||
      prompt.includes("garde-robe") ||
      prompt.includes("recette") ||
      prompt.includes("tâche") ||
      prompt.includes("pour");
    return JSON.stringify({
      plan: {
        phases: isFr
          ? ["Analyse", "Conception", "Implémentation", "Validation"]
          : ["Analysis", "Design", "Implementation", "Validation"],
        estimatedTasks: 18,
        dynamicAgentsNeeded: 1,
        rationale: isFr
          ? "Optimisation de la planification des tâches pour exécution parallèle."
          : "Optimization of task planning for parallel execution.",
      },
    });
  }
}

// ============================================
// Stub providers for future real implementations
// ============================================

export class OpenAIProvider implements IModelProvider {
  readonly name = "openai";
  readonly isConfigured: boolean;

  constructor(apiKey?: string) {
    this.isConfigured = !!apiKey;
  }

  async complete(_request: ModelRequest): Promise<ModelResponse> {
    if (!this.isConfigured) {
      throw new Error("OpenAI API key is not configured");
    }
    // Real implementation would call OpenAI API here
    throw new Error("OpenAI provider: real API calls not yet implemented");
  }

  async checkHealth(): Promise<{ status: "ok" | "error"; message: string }> {
    if (!this.isConfigured) {
      return { status: "error", message: "OpenAI API key not configured" };
    }
    return { status: "ok", message: "OpenAI configured (calls not yet implemented)" };
  }
}

export class AzureOpenAIProvider implements IModelProvider {
  readonly name = "azure";
  readonly isConfigured: boolean;

  constructor(endpoint?: string, apiKey?: string) {
    this.isConfigured = !!endpoint && !!apiKey;
  }

  async complete(_request: ModelRequest): Promise<ModelResponse> {
    if (!this.isConfigured) {
      throw new Error("Azure OpenAI is not configured");
    }
    throw new Error("Azure OpenAI provider: real API calls not yet implemented");
  }

  async checkHealth(): Promise<{ status: "ok" | "error"; message: string }> {
    if (!this.isConfigured) {
      return {
        status: "error",
        message: "Azure OpenAI endpoint or key not configured",
      };
    }
    return {
      status: "ok",
      message: "Azure OpenAI configured (calls not yet implemented)",
    };
  }
}

// ============================================
// Helpers
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}


