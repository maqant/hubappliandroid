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

    // Workshop / Conception assistée ideation per layer
    if (sys.includes("workshop") || sys.includes("atelier") || sys.includes("conception assistée") || sys.includes("synthétiseur") || sys.includes("interprète") || prompt.includes("COUCHE DEMANDÉE")) {
      return this.generateWorkshopProposals(request);
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

  private generateWorkshopProposals(request: ModelRequest): string {
    const prompt = request.prompt;
    const sys = request.systemPrompt || "";

    // Detect layer from prompt
    let layer = "INTENTION";
    if (prompt.includes("HYPOTHESIS")) layer = "HYPOTHESIS";
    else if (prompt.includes("CAPABILITY")) layer = "CAPABILITY";
    else if (prompt.includes("FEATURE")) layer = "FEATURE";
    else if (prompt.includes("JOURNEY")) layer = "JOURNEY";
    else if (prompt.includes("SCREEN")) layer = "SCREEN";

    // Extract perspective
    let perspective = "Visionnaire";
    const perspMatch = sys.match(/perspective\s*:\s*([^\n]+)/i);
    if (perspMatch && perspMatch[1]) {
      perspective = perspMatch[1].trim();
    }

    // Determine domain context
    const lowerPrompt = prompt.toLowerCase();
    let domain = "l'application";
    if (lowerPrompt.includes("vêtement") || lowerPrompt.includes("garde-robe") || lowerPrompt.includes("wardrobe") || lowerPrompt.includes("tenue")) {
      domain = "la garde-robe intelligente";
    } else if (lowerPrompt.includes("recette") || lowerPrompt.includes("cuisine") || lowerPrompt.includes("recipe")) {
      domain = "le carnet de recettes interactif";
    } else if (lowerPrompt.includes("tâche") || lowerPrompt.includes("todo") || lowerPrompt.includes("task")) {
      domain = "le gestionnaire de tâches agile";
    }

    const proposalsByLayer: Record<string, any[]> = {
      INTENTION: [
        {
          title: `Zéro friction vestimentaire matinale pour ${domain}`,
          shortPitch: "Éliminer 100% de la fatigue décisionnelle chaque matin avant le départ.",
          type: "INTENTION_PRIMAIRE",
          description: `Permettre à l'utilisateur d'obtenir une recommandation optimale en moins de 3 secondes dès l'ouverture de ${domain}, basée sur sa météo exacte et son agenda du jour.`,
          justification: "Le problème principal n'est pas le manque d'habits mais l'hésitation quotidienne au réveil.",
          userValue: "Gain de 10 à 15 minutes chaque matin et sérénité vestimentaire.",
          confidence: 0.95,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "S"
        },
        {
          title: "Valorisation éco-responsable du dressing existant",
          shortPitch: "Maximiser la rotation des vêtements sous-utilisés du dressing.",
          type: "INTENTION_SECONDAIRE",
          description: "Révéler les combinaisons vestimentaires oubliées dans le dressing au lieu de pousser à l'achat compulsif.",
          justification: "En moyenne 70% d'un dressing n'est porté que 2 fois par an.",
          userValue: "Économies financières et mode plus éco-responsable.",
          confidence: 0.88,
          originPerspective: perspective,
          priority: "MEDIUM",
          complexity: "M"
        },
        {
          title: "Adaptation dynamique au style de vie et à la météo géolocalisée",
          shortPitch: "Synchronisation automatique météo + trajets + style personnel.",
          type: "INTENTION_STRATÉGIQUE",
          description: "Garantir un confort thermique et esthétique en croisant la météo heure par heure avec le mode de transport (vélo, marche, métro).",
          justification: "Une tenue adaptée au soleil du matin peut être totalement inadéquate pour la pluie du soir en vélo.",
          userValue: "Confort thermique garanti toute la journée.",
          confidence: 0.92,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        }
      ],
      HYPOTHESIS: [
        {
          title: "80% des tenues portées proviennent de 20% des vêtements possédés",
          shortPitch: "La loi de Pareto s'applique à la garde-robe quotidienne.",
          type: "HYPOTHÈSE_COMPORTEMENTALE",
          description: "Les utilisateurs préfèrent la simplicité et répètent des ensembles 'valeurs sûres' plutôt que d'expérimenter sans filet.",
          justification: "À valider par l'historique de validation des tenues proposées.",
          userValue: "Permet de suggérer d'abord les associations à fort taux de succès.",
          confidence: 0.90,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "S"
        },
        {
          title: "La saisie manuelle initiale est le 1er facteur d'abandon",
          shortPitch: "L'onboarding doit nécessiter moins de 2 minutes pour convertir.",
          type: "HYPOTHÈSE_ADOPTION",
          description: "Demander à l'utilisateur de photographier l'intégralité de son armoire le premier jour provoque l'abandon de l'application.",
          justification: "Nécessite une importation progressive ou des presets de garde-robe type.",
          userValue: "Onboarding fluide sans corvée d'inventaire.",
          confidence: 0.94,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "La météo locale perçue prime sur la température brute",
          shortPitch: "Le vent et l'humidité influencent plus le choix vestimentaire que les degrés.",
          type: "HYPOTHÈSE_USAGE",
          description: "Un 15°C pluvieux avec du vent demande une tenue plus chaude qu'un 12°C ensoleillé et sec.",
          justification: "Algorithme basé sur la température ressentie et le risque de précipitations.",
          userValue: "Recommandations d'une grande justesse météo.",
          confidence: 0.86,
          originPerspective: perspective,
          priority: "MEDIUM",
          complexity: "M"
        }
      ],
      CAPABILITY: [
        {
          title: "Moteur de recommandations météo-sensible prédictif",
          shortPitch: "Calcul instantané de tenues adaptées à la température ressentie.",
          type: "CAPACITÉ_MÉTIER",
          description: "Capacité du système à consommer les prévisions météo heure par heure et à générer un score de compatibilité thermique pour chaque tenue.",
          justification: "Socle algorithmique indispensable pour tenir la promesse d'intention.",
          userValue: "Tenue garantie zéro coup de froid ou coup de chaud.",
          confidence: 0.96,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "Dressing virtuel avec catégorisation automatique",
          shortPitch: "Inventaire dynamique et visuel des articles vestimentaires.",
          type: "CAPACITÉ_GESTION",
          description: "Capacité à classifier les vêtements par catégorie (haut, bas, chaussures, veste), saison, couleur et niveau de formalité.",
          justification: "Nécessaire pour assembler des combinaisons logiques (1 haut + 1 bas + 1 veste + chaussures).",
          userValue: "Vue d'ensemble claire et organisée de son armoire.",
          confidence: 0.91,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "Apprentissage continu des préférences et feedbacks",
          shortPitch: "Affinement progressif des suggestions selon les choix validés.",
          type: "CAPACITÉ_IA",
          description: "Capacité à mémoriser les tenues acceptées ou refusées pour ajuster les recommandations futures au style personnel.",
          justification: "Évite de proposer des tenues scientifiquement correctes mais stylistiquement rejetées par l'utilisateur.",
          userValue: "Application qui s'adapte à mon goût au fil des jours.",
          confidence: 0.89,
          originPerspective: perspective,
          priority: "MEDIUM",
          complexity: "L"
        }
      ],
      FEATURE: [
        {
          title: "Widget 'Tenue du Jour' 1-Clic sur l'écran d'accueil",
          shortPitch: "La suggestion idéale affichée dès l'ouverture de l'application.",
          type: "FONCTIONNALITÉ_CLEF",
          description: "Affichage visuel de la tenue recommandée du matin avec bouton 'Valider la tenue' ou 'Proposer une alternative'.",
          justification: "Réduit le temps d'interaction au strict minimum pour les utilisateurs pressés.",
          userValue: "Décision prise en une seconde.",
          confidence: 0.97,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "S"
        },
        {
          title: "Générateur d'alternatives rapides 'Changer une pièce'",
          shortPitch: "Remplacer le pantalon ou les chaussures en un swipe sans changer le reste.",
          type: "FONCTIONNALITÉ_INTERACTION",
          description: "Permet de verrouiller la veste et le haut mais de demander une alternative uniquement pour le bas.",
          justification: "Offre de la souplesse quand une pièce spécifique est au lavage ou indisponible.",
          userValue: "Contrôle sans repartir de zéro.",
          confidence: 0.93,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "Alerte météo vestimentaire matinale (Push Notification)",
          shortPitch: "Notification programmable le matin : 'Aujourd'hui pluie prévue à 17h, prévoyez un imperméable'.",
          type: "FONCTIONNALITÉ_ENGAGEMENT",
          description: "Notification proactive quotidienne rappelant la tenue suggérée et les pièges météo de la journée.",
          justification: "Génère l'habitude d'utilisation matinale avant de s'habiller.",
          userValue: "Jamais pris au dépourvu par le temps.",
          confidence: 0.90,
          originPerspective: perspective,
          priority: "MEDIUM",
          complexity: "S"
        }
      ],
      JOURNEY: [
        {
          title: "Parcours 'Routine du Matin en 10 Secondes'",
          shortPitch: "Notification -> Ouverture Widget -> Validation de tenue -> Départ.",
          type: "PARCOURS_PRINCIPAL",
          description: "L'utilisateur reçoit la notification à 7h30, tape dessus, voit la tenue du jour adaptée à 18°C pluvieux, clique 'Je porte ça' et ferme l'app.",
          justification: "Parcours nominal répété 300 jours par an par l'utilisateur actif.",
          userValue: "Début de journée fluide et efficace.",
          confidence: 0.95,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "S"
        },
        {
          title: "Parcours 'Ajout Éclair d'un Nouveau Vêtement'",
          shortPitch: "Photo de l'article -> Catégorisation auto -> Ajout au dressing.",
          type: "PARCOURS_ENRICHISSEMENT",
          description: "L'utilisateur prend une photo d'un nouveau pull. L'IA détoure le vêtement, identifie la couleur et la catégorie, et l'intègre immédiatement dans les combinaisons.",
          justification: "Réduit la friction de saisie d'un nouvel achat.",
          userValue: "Nouveau vêtement prêt à être porté dans les suggestions.",
          confidence: 0.91,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "Parcours 'Préparation de Valise de Voyage'",
          shortPitch: "Sélection destination + dates -> Liste optimisée de tenues à emporter.",
          type: "PARCOURS_OCCASIONNEL",
          description: "L'utilisateur indique '3 jours à Lyon ce WE'. L'app vérifie la météo lyonnaise et sélectionne 5 pièces combinables pour faire 3 tenues complètes sans surcharger la valise.",
          justification: "Résout le casse-tête fréquent des voyages et déplacements professionnels.",
          userValue: "Valise légère et 100% adaptée.",
          confidence: 0.88,
          originPerspective: perspective,
          priority: "MEDIUM",
          complexity: "L"
        }
      ],
      SCREEN: [
        {
          title: "Écran 'Aujourd'hui' (Dashboard Principal)",
          shortPitch: "Vue synthétique météo + recommandation de tenue du jour.",
          type: "ÉCRAN_ACCUEIL",
          description: "Comprend la bannière météo dynamique (température, pluie, vent), l'avatar ou le visuel de la tenue complète suggérée, et les boutons d'action (Valider, Alternative, Détails).",
          justification: "Écran d'atterrissage principal au lancement de l'application.",
          userValue: "Information essentielle immédiatement lisible.",
          confidence: 0.98,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "Écran 'Dressing & Armoire Virtuelle'",
          shortPitch: "Grille visuelle de tous les vêtements filtrable par saison/catégorie.",
          type: "ÉCRAN_COLLECTION",
          description: "Affiche les articles vestimentaires sous forme de vignettes de haute qualité, avec filtres rapides (Hauts, Bas, Vestes, Chaussures) et statut de fraîcheur/portage.",
          justification: "Visualisation complète et agréable du dressing personnel.",
          userValue: "Contrôle visuel total sur ses affaires.",
          confidence: 0.94,
          originPerspective: perspective,
          priority: "HIGH",
          complexity: "M"
        },
        {
          title: "Écran 'Détail de la Tenue & Métriques Météo'",
          shortPitch: "Fiche détaillée expliquant pourquoi cette tenue est recommandée.",
          type: "ÉCRAN_DÉTAIL",
          description: "Montre l'association pièce par pièce avec l'indice de confort thermique heure par heure (ex. 'Indice 9/10 pour 14°C à 8h, imperméable requis à 17h').",
          justification: "Rassure l'utilisateur sur la pertinence scientifique de la recommandation.",
          userValue: "Transparence totale sur la suggestion IA.",
          confidence: 0.89,
          originPerspective: perspective,
          priority: "MEDIUM",
          complexity: "S"
        }
      ]
    };

    const proposals = proposalsByLayer[layer] || proposalsByLayer["INTENTION"]!;

    return JSON.stringify({
      schemaVersion: "workshop-response-v1",
      agentId: `WORKSHOP-${layer}`,
      layer,
      summary: `Synthèse d'idéation pour la couche ${layer} (${perspective}) : ${proposals.length} propositions divergentes générées avec succès.`,
      proposals,
      questions: [
        {
          statement: `Quelle est la tolérance de l'utilisateur aux notifications quotidiennes pour la couche ${layer} ?`,
          importance: "IMPORTANT"
        }
      ],
      assumptions: [
        {
          statement: `Les propositions de la couche ${layer} répondent aux contraintes principales du brief.`,
          impact: "HIGH"
        }
      ],
      warnings: []
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
// Remote OpenAI Provider (Client Side)
// ============================================

export class RemoteOpenAIProvider implements IModelProvider {
  readonly name = "openai";
  readonly isConfigured = true;

  private static readonly TIMEOUT_MS = 120_000;
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BASE_DELAY_MS = 2_000;

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const endpoint = "/api/ai/complete";
    let lastError: any;

    for (let attempt = 0; attempt <= RemoteOpenAIProvider.MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(new Error(`Timeout après ${RemoteOpenAIProvider.TIMEOUT_MS / 1000}s (RemoteOpenAIProvider)`)),
        RemoteOpenAIProvider.TIMEOUT_MS
      );

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        // Retry on 429 and 5xx
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`HTTP ${res.status}`);
          const retryAfter = Number(res.headers.get("retry-after")) || 0;
          const delay = Math.max(retryAfter * 1000, RemoteOpenAIProvider.RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!res.ok) {
          let errText = "Unknown error";
          let diagnostic: any = null;
          try {
            const errJson = await res.json();
            errText = errJson.error || res.statusText;
            diagnostic = errJson.diagnostic;
          } catch {
            errText = await res.text();
          }
          const error: any = new Error(`OpenAI Provider Error: ${errText}`);
          if (diagnostic) error.diagnostic = diagnostic;
          error.isNetworkError = false;
          throw error;
        }

        return await res.json();
      } catch (err: any) {
        // If already decorated (HTTP error from above), re-throw as-is
        if (err.isNetworkError === false) {
          throw err;
        }

        // Catch AbortError specifically to use its reason
        let actualError = err;
        if (controller.signal.aborted && controller.signal.reason) {
          actualError = controller.signal.reason instanceof Error ? controller.signal.reason : new Error(String(controller.signal.reason));
        }

        // Network-level failure: Failed to fetch, AbortError, timeout
        const clientDiagnostic: Record<string, unknown> = {
          source: "client",
          errorName: actualError.name || "UnknownError",
          errorMessage: actualError.message || String(actualError),
          online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
          signalAborted: controller.signal.aborted,
          endpoint,
          taskId: request.metadata?.taskId || null,
          agentId: request.metadata?.agentId || null,
          timestamp: new Date().toISOString(),
          attempt,
        };

        const networkError: any = new Error(`Network Error: ${actualError.message}`);
        networkError.diagnostic = clientDiagnostic;
        networkError.isNetworkError = true;
        lastError = networkError;

        if (attempt === RemoteOpenAIProvider.MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, RemoteOpenAIProvider.RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error("Unknown network failure in provider");
  }

  async checkHealth(): Promise<{ status: "ok" | "error"; message: string }> {
    try {
      const res = await fetch("/api/ai/health");
      if (!res.ok) return { status: "error", message: `Health check failed: ${res.status}` };
      const data = await res.json();
      if (data.provider !== "openai") {
        return { status: "error", message: `Server is using ${data.provider}, not openai` };
      }
      return { status: "ok", message: "Remote OpenAI configured and reachable" };
    } catch (e: any) {
      return { status: "error", message: `Network error: ${e.message}` };
    }
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


