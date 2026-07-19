"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "fr" | "en";

const translations = {
  fr: {
    // Navigation
    "nav.projects": "📁 Mes Projets",
    "nav.newProject": "✨ Nouveau Projet",
    "nav.aiSettings": "🤖 Paramètres de l'IA",
    "nav.settings": "⚙️ Paramètres",
    "nav.title": "📐 Blueprint Hub",

    // Common Actions
    "action.accept": "Accepter",
    "action.reject": "Refuser",
    "action.correct": "Corriger",
    "action.lock": "Verrouiller",
    "action.cancel": "Annuler",
    "action.confirm": "Confirmer",
    "action.save": "Enregistrer",
    "action.delete": "Supprimer",
    "action.archive": "Archiver",
    "action.back": "Retour",
    "action.close": "Fermer",
    "action.loading": "Chargement...",

    // Statuses
    "status.proposed": "Proposé",
    "status.accepted": "Accepté",
    "status.corrected": "Corrigé",
    "status.rejected": "Refusé",
    "status.locked": "Verrouillé",
    "status.pending": "En attente",
    "status.planned": "Planifiée",
    "status.running": "En cours",
    "status.completed": "Terminée",
    "status.failed": "Échouée",
    "status.draft": "Brouillon",
    "status.approved": "Approuvé",
    "status.published": "Publié",
    "status.frozen": "Gelée",
    "status.passed": "Réussie",
    "status.blocked": "Bloquée",
    "status.warning": "Avertissement",
    "status.blocking": "Bloquant",

    // Project List
    "projects.title": "Mes Projets",
    "projects.searchPlaceholder": "Rechercher un projet...",
    "projects.noProjects": "Aucun projet pour le moment.",
    "projects.createFirst": "Créez votre premier projet pour commencer !",
    "projects.archived": "Archivé",
    "projects.active": "Actif",

    // New Project
    "newProject.title": "Nouveau Projet",
    "newProject.nameLabel": "Nom du Projet",
    "newProject.namePlaceholder": "ex: Garde-Robe Intelligente",
    "newProject.descLabel": "Description (optionnelle)",
    "newProject.descPlaceholder": "Brève description de votre projet...",
    "newProject.ideaLabel": "Votre Idée ou Conversation",
    "newProject.ideaPlaceholder":
      "Décrivez votre idée de produit ici... Plus vous donnez de détails, meilleure sera l'analyse de départ.",
    "newProject.createBtn": "Créer le Projet",
    "newProject.savingDraft": "Enregistrement du brouillon...",
    "newProject.draftSaved": "Brouillon enregistré",

    // Project Detail Tabs
    "tab.sources": "Sources",
    "tab.brief": "Compréhension",
    "tab.decisions": "Décisions",
    "tab.organization": "Organisation",
    "tab.control": "Centre de contrôle",
    "tab.conflicts": "Conflits",
    "tab.blueprint": "Blueprint",
    "tab.audits": "Audits",
    "tab.baseline": "Version de référence",
    "tab.package": "Paquet final",
    "tab.settings": "Paramètres",

    // Empty states
    "empty.sources":
      "Aucune source externe ajoutée. Saisissez du texte ou importez des notes pour enrichir le brief.",
    "empty.brief": "Exécutez d'abord l'analyse de votre idée de projet dans l'onglet Sources.",
    "empty.decisions":
      "Aucune décision formalisée pour le moment.\n\nLes éléments verrouillés du brief servent de références à la mission. Les décisions structurées apparaîtront ici lorsqu'elles auront été formalisées pendant la conception.",
    "empty.organization": "Examinez d'abord le brief, puis planifiez la mission.",
    "empty.control": "Planifiez une mission pour afficher les tâches et leur progression.",
    "empty.conflicts": "Aucune contradiction détectée dans les éléments actuellement validés.",
    "empty.blueprint": "Exécutez la mission pour générer les sections du blueprint.",
    "empty.audits": "Générez d'abord le blueprint avant de lancer les audits.",
    "empty.baseline": "Exécutez les audits et résolvez les blocages avant de geler la baseline.",
    "empty.package": "Gelez une baseline valide avant de générer le paquet.",

    // Tooltips & Descriptions
    "lock.confirm.title": "Verrouiller cet élément ?",
    "lock.confirm.desc":
      "Cet élément sera utilisé comme référence stable par les agents de conception. Pour le modifier ensuite, vous devrez créer une demande de changement.",
    "lock.help":
      "Verrouiller confirme cet élément comme référence stable pour la conception. Il ne pourra plus être modifié directement. Les décisions formalisées seront créées lors de la conception de la mission lorsqu'elles sont nécessaires.",
    "lock.success": "Élément verrouillé. Il sera utilisé comme référence lors de la conception.",
    "idempotent.noChange": "Aucune modification à enregistrer",
    "correct.success": "Correction enregistrée",
    "accept.success": "Élément accepté",
    "reject.success": "Élément refusé et exclu du projet actif",

    // Organization tab
    "org.title": "Organisation de la mission",
    "org.desc":
      "Cette étape prépare les spécialistes, les tâches et les contrôles nécessaires pour transformer votre brief validé en blueprint d'application.",
    "org.stats.title": "Statistiques du brief",
    "org.stats.total": "Total des éléments :",
    "org.stats.accepted": "Acceptés :",
    "org.stats.locked": "Verrouillés :",
    "org.stats.rejected": "Refusés :",
    "org.stats.remaining": "À examiner :",
    "org.planBtn": "Planifier la mission",
    "org.startBtn": "Lancer la mission",
    "org.cannotPlan": "Vous devez d'abord accepter ou verrouiller au moins un élément du brief.",
    "org.agentsList": "Agents de conception assignés",
    "org.tasksList": "Graphe des tâches de conception",
    "org.budget": "Budget virtuel simulé :",

    // Control tab
    "control.title": "Centre de contrôle",
    "control.notStarted": "Cette mission est planifiée, mais elle n'a pas encore été lancée.",
    "control.running": "Mission en cours d'exécution par les agents...",
    "control.completed": "Mission complétée avec succès !",
    "control.progress": "Progression :",
    "control.calls": "Appels de modèle simulés :",
    "control.budgetUsed": "Budget jetons consommé :",
    "control.logs": "Journal des événements d'exécution",

    // Baseline tab
    "baseline.title": "Version de référence",
    "baseline.freezeBtn": "📌 Geler la version de référence",
    "baseline.frozenMsg": "Version de référence déjà gelée",
    "baseline.blockedMsg":
      "⚠️ Le gèle de la version de référence est bloqué. Certaines gates de validation ont échoué. Veuillez consulter l'onglet Audits.",
    "baseline.draftBlockedMsg":
      "⚠️ Le gèle est bloqué car certains documents du blueprint sont encore au statut Brouillon (DRAFT). Veuillez tous les approuver dans l'onglet Blueprint.",
    "baseline.noBaseline": "Aucune version de référence gelée pour le moment.",
    "baseline.details": "Artefacts : {art} | Gates : {gates}",

    // Package tab
    "package.title": "Paquet final",
    "package.generateBtn": "📦 Générer le paquet",
    "package.downloadBtn": "⬇️ Télécharger le master",
    "package.generating": "Génération en cours...",
    "package.ready": "Le paquet de livraison est prêt pour l'intégration logicielle.",
    "package.files": "Fichiers inclus dans le paquet",

    // i18n switcher
    "settings.language": "Langue de l'application",
    "settings.langFr": "Français",
    "settings.langEn": "English",

    // Agents & Tâches
    "agent.name.FIX-DIRECTOR": "Directeur de Mission",
    "agent.purpose.FIX-DIRECTOR": "Planifier et déléguer sans valider son propre travail.",
    "agent.name.FIX-PRODUCT": "Direction Produit",
    "agent.purpose.FIX-PRODUCT": "Problème, utilisateurs, valeur et critères de succès.",
    "agent.name.FIX-SCOPE": "Gardien du MVP",
    "agent.purpose.FIX-SCOPE": "Classifier et éviter le gonflement du périmètre.",
    "agent.name.FIX-NOVICE": "Utilisateur Non-Technique",
    "agent.purpose.FIX-NOVICE": "Détecter toute exigence de connaissances superflues.",
    "agent.name.FIX-UX": "UX Guidée",
    "agent.purpose.FIX-UX": "Parcours, états, prévention des erreurs et récupération.",
    "agent.name.FIX-DESIGN": "Système de Design",
    "agent.purpose.FIX-DESIGN": "Cohérence visuelle, composants et contenus.",
    "agent.name.FIX-CROSSAPP": "Cohérence Transverse",
    "agent.purpose.FIX-CROSSAPP": "Conformité avec la plateforme professionnelle.",
    "agent.name.FIX-ARCH": "React Vercel Architecture",
    "agent.purpose.FIX-ARCH": "Architecture web et serveur.",
    "agent.name.FIX-AI": "Architecture IA",
    "agent.purpose.FIX-AI": "Passerelle, fournisseurs, modèles, budgets et sorties.",
    "agent.name.FIX-SECURITY": "Sécurité",
    "agent.purpose.FIX-SECURITY": "Secrets, autorisations, chargements, injections et logs.",
    "agent.name.FIX-PRIVACY": "Confidentialité",
    "agent.purpose.FIX-PRIVACY": "Données, finalité, rétention, export et suppression.",
    "agent.name.FIX-COMPLIANCE": "Conformité",
    "agent.purpose.FIX-COMPLIANCE": "Obligations réglementaires et revues humaines.",
    "agent.name.FIX-A11Y": "Accessibilité",
    "agent.purpose.FIX-A11Y": "Critères de conformité et tests d'accessibilité.",
    "agent.name.FIX-QA": "Assurance Qualité",
    "agent.purpose.FIX-QA": "Exigences, plans de test et preuves de validation.",
    "agent.name.FIX-VERCEL": "Déploiement Vercel",
    "agent.purpose.FIX-VERCEL": "Prévisualisation, Production et retours arrière.",
    "agent.name.FIX-COST": "Gestion des Coûts",
    "agent.purpose.FIX-COST": "Budgets, quotas et métriques financières.",
    "agent.name.FIX-TECH-AUDIT": "Audit Technique",
    "agent.purpose.FIX-TECH-AUDIT": "Cohérence globale en trois passes.",
    "agent.name.FIX-PACKAGE-AUDIT": "Audit du Paquet",
    "agent.purpose.FIX-PACKAGE-AUDIT": "Version de référence vs paquet final.",
    "agent.name.DYN-USER-RESEARCH": "Spécialiste Recherche Utilisateur",
    "agent.purpose.DYN-USER-RESEARCH":
      "Analyse approfondie des besoins utilisateur et des personas.",
    "agent.name.DYN-RISK-ANALYST": "Analyste de Risques",
    "agent.purpose.DYN-RISK-ANALYST": "Évaluation des risques détaillés et plans de mitigation.",
  },
  en: {
    // Navigation
    "nav.projects": "📁 My Projects",
    "nav.newProject": "✨ New Project",
    "nav.aiSettings": "🤖 AI Settings",
    "nav.settings": "⚙️ Settings",
    "nav.title": "📐 Blueprint Hub",

    // Common Actions
    "action.accept": "Accept",
    "action.reject": "Reject",
    "action.correct": "Correct",
    "action.lock": "Lock",
    "action.cancel": "Cancel",
    "action.confirm": "Confirm",
    "action.save": "Save",
    "action.delete": "Delete",
    "action.archive": "Archive",
    "action.back": "Back",
    "action.close": "Close",
    "action.loading": "Loading...",

    // Statuses
    "status.proposed": "Proposed",
    "status.accepted": "Accepted",
    "status.corrected": "Corrected",
    "status.rejected": "Rejected",
    "status.locked": "Locked",
    "status.pending": "Pending",
    "status.planned": "Planned",
    "status.running": "Running",
    "status.completed": "Completed",
    "status.failed": "Failed",
    "status.draft": "Draft",
    "status.approved": "Approved",
    "status.published": "Published",
    "status.frozen": "Frozen",
    "status.passed": "Passed",
    "status.blocked": "Blocked",
    "status.warning": "Warning",
    "status.blocking": "Blocking",

    // Project List
    "projects.title": "My Projects",
    "projects.searchPlaceholder": "Search projects...",
    "projects.noProjects": "No projects yet.",
    "projects.createFirst": "Create your first project to get started!",
    "projects.archived": "Archived",
    "projects.active": "Active",

    // New Project
    "newProject.title": "New Project",
    "newProject.nameLabel": "Project Name",
    "newProject.namePlaceholder": "e.g., Smart Wardrobe",
    "newProject.descLabel": "Description (optional)",
    "newProject.descPlaceholder": "Brief description...",
    "newProject.ideaLabel": "Your Idea or Conversation",
    "newProject.ideaPlaceholder":
      "Describe your product idea here... The more context you provide, the better the analysis.",
    "newProject.createBtn": "Create Project",
    "newProject.savingDraft": "Saving draft...",
    "newProject.draftSaved": "Draft saved",

    // Project Detail Tabs
    "tab.sources": "Sources",
    "tab.brief": "Brief",
    "tab.decisions": "Decisions",
    "tab.organization": "Organization",
    "tab.control": "Control",
    "tab.conflicts": "Conflicts",
    "tab.blueprint": "Blueprint",
    "tab.audits": "Audits",
    "tab.baseline": "Baseline",
    "tab.package": "Package",
    "tab.settings": "Settings",

    // Empty states
    "empty.sources": "No external sources added. Paste text or import notes to enrich the brief.",
    "empty.brief": "Run the project idea analysis in the Sources tab first.",
    "empty.decisions":
      "No formalized decisions yet.\n\nLocked brief items serve as authoritative inputs. Structured decisions will appear here when formalized during the mission.",
    "empty.organization": "Review the brief first, then plan the design mission.",
    "empty.control": "Plan a mission first to display tasks and their progress.",
    "empty.conflicts": "No contradictions detected in currently validated items.",
    "empty.blueprint": "Run the design mission to generate blueprint sections.",
    "empty.audits": "Generate the blueprint first before running audits.",
    "empty.baseline": "Run audits and resolve issues before freezing the baseline.",
    "empty.package": "Freeze a valid baseline before generating the package.",

    // Tooltips & Descriptions
    "lock.confirm.title": "Lock this element?",
    "lock.confirm.desc":
      "This element will be used as a stable reference by the design agents. To modify it later, you will need to create a Change Request.",
    "lock.help":
      "Lock confirms this item as a stable reference. It cannot be modified directly. Formal decisions will be created when needed during the design mission.",
    "lock.success": "Item locked. It will be used as reference during design.",
    "idempotent.noChange": "No changes to save",
    "correct.success": "Correction saved",
    "accept.success": "Item accepted",
    "reject.success": "Item rejected and excluded from active project",

    // Organization tab
    "org.title": "Mission Organization",
    "org.desc":
      "This step prepares specialists, tasks, and controls to transform your validated brief into a blueprint.",
    "org.stats.title": "Brief statistics",
    "org.stats.total": "Total items:",
    "org.stats.accepted": "Accepted:",
    "org.stats.locked": "Locked:",
    "org.stats.rejected": "Rejected:",
    "org.stats.remaining": "Remaining:",
    "org.planBtn": "Plan the Mission",
    "org.startBtn": "Start Mission",
    "org.cannotPlan": "You must accept or lock at least one brief item first.",
    "org.agentsList": "Assigned Design Agents",
    "org.tasksList": "Design Tasks Graph",
    "org.budget": "Simulated Virtual Budget:",

    // Control tab
    "control.title": "Control Center",
    "control.notStarted": "This mission is planned but has not been started yet.",
    "control.running": "Mission is running...",
    "control.completed": "Mission completed successfully!",
    "control.progress": "Progress:",
    "control.calls": "Simulated model calls:",
    "control.budgetUsed": "Budget tokens used:",
    "control.logs": "Execution events logs",

    // Baseline tab
    "baseline.title": "Baseline",
    "baseline.freezeBtn": "📌 Freeze Baseline",
    "baseline.frozenMsg": "Baseline already frozen",
    "baseline.blockedMsg":
      "⚠️ Baseline freezing is blocked. Some validation gates have failed. Please check the Audits tab.",
    "baseline.draftBlockedMsg":
      "⚠️ Baseline freezing is blocked because some blueprint documents are still Drafts. Please approve them in the Blueprint tab.",
    "baseline.noBaseline": "No baseline frozen yet.",
    "baseline.details": "Artifacts: {art} | Gates: {gates}",

    // Package tab
    "package.title": "Package",
    "package.generateBtn": "📦 Generate Package",
    "package.downloadBtn": "⬇️ Download MASTER",
    "package.generating": "Generating...",
    "package.ready": "The package is ready for software integration.",
    "package.files": "Included Files",

    // i18n switcher
    "settings.language": "Application Language",
    "settings.langFr": "French",
    "settings.langEn": "English",

    // Agents & Tasks
    "agent.name.FIX-DIRECTOR": "Mission Director",
    "agent.purpose.FIX-DIRECTOR": "Plan and delegate without validating own work.",
    "agent.name.FIX-PRODUCT": "Product Direction",
    "agent.purpose.FIX-PRODUCT": "Problem, users, value and success criteria.",
    "agent.name.FIX-SCOPE": "MVP Guardian",
    "agent.purpose.FIX-SCOPE": "Classify and prevent scope creep.",
    "agent.name.FIX-NOVICE": "Non-Technical User",
    "agent.purpose.FIX-NOVICE": "Detect any unnecessary knowledge required.",
    "agent.name.FIX-UX": "Guided UX",
    "agent.purpose.FIX-UX": "Journeys, states, prevention and recovery.",
    "agent.name.FIX-DESIGN": "Design System",
    "agent.purpose.FIX-DESIGN": "Visual consistency, components and content.",
    "agent.name.FIX-CROSSAPP": "Cross-Application Consistency",
    "agent.purpose.FIX-CROSSAPP": "Professional platform compliance.",
    "agent.name.FIX-ARCH": "React Vercel Architecture",
    "agent.purpose.FIX-ARCH": "Web and server architecture.",
    "agent.name.FIX-AI": "AI Architecture",
    "agent.purpose.FIX-AI": "Gateway, providers, models, budgets and outputs.",
    "agent.name.FIX-SECURITY": "Security",
    "agent.purpose.FIX-SECURITY": "Secrets, authZ, uploads, injections and logs.",
    "agent.name.FIX-PRIVACY": "Privacy",
    "agent.purpose.FIX-PRIVACY": "Data, purpose, retention, export and deletion.",
    "agent.name.FIX-COMPLIANCE": "Compliance",
    "agent.purpose.FIX-COMPLIANCE": "Obligations and human reviews.",
    "agent.name.FIX-A11Y": "Accessibility",
    "agent.purpose.FIX-A11Y": "Criteria and tests.",
    "agent.name.FIX-QA": "QA",
    "agent.purpose.FIX-QA": "Requirements, tests and proofs.",
    "agent.name.FIX-VERCEL": "Vercel Deployment",
    "agent.purpose.FIX-VERCEL": "Preview, Production and rollback.",
    "agent.name.FIX-COST": "Costs",
    "agent.purpose.FIX-COST": "Budgets, quotas and metrics.",
    "agent.name.FIX-TECH-AUDIT": "Technical Audit",
    "agent.purpose.FIX-TECH-AUDIT": "Global consistency in three passes.",
    "agent.name.FIX-PACKAGE-AUDIT": "Package Audit",
    "agent.purpose.FIX-PACKAGE-AUDIT": "Baseline vs final package.",
    "agent.name.DYN-USER-RESEARCH": "User Research Specialist",
    "agent.purpose.DYN-USER-RESEARCH": "Deep analysis of user needs and personas.",
    "agent.name.DYN-RISK-ANALYST": "Risk Analyst",
    "agent.purpose.DYN-RISK-ANALYST": "Detailed risk assessment and mitigation planning.",
  },
};

const I18nContext = createContext<{
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof (typeof translations)["fr"]) => string;
} | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("fr");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("pbh_lang") as Language;
      if (stored === "fr" || stored === "en") {
        setLangState(stored);
      }
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("pbh_lang", newLang);
    }
  };

  const t = (key: string): string => {
    const dict = translations[lang] || translations["fr"];
    return dict[key as keyof (typeof translations)["fr"]] || key;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
