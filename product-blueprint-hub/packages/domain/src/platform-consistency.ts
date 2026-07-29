import type { EntityId, TargetPlatform, Project } from "./entities";
import type { DesignProposal } from "./design-proposals";

export type PlatformConsistencyStatus = 'CONFIRMED' | 'MISSING' | 'CONTRADICTORY';

export interface ConflictingSource {
  source: 'BRIEF' | 'PROPOSAL';
  id: string;
  title?: string;
  declaredPlatform: TargetPlatform | string;
  reason?: string;
}

export interface PlatformConsistencyReport {
  status: PlatformConsistencyStatus;
  canonicalPlatform: TargetPlatform | null;
  conflictingSources: ConflictingSource[];
  incompatibleProposalIds: EntityId[];
  incompatibleCount: number;
  warnings: string[];
  recommendation: string;
}

export function computePlatformConsistency(
  project?: Partial<Project> | null,
  proposals: DesignProposal[] = [],
  _briefItems: any[] = []
): PlatformConsistencyReport {
  const targetPlatforms = project?.targetPlatforms || [];
  const canonicalPlatform = targetPlatforms.length > 0 ? targetPlatforms[0] : null;

  const conflictingSources: ConflictingSource[] = [];
  const incompatibleProposalIds: EntityId[] = [];
  const warnings: string[] = [];

  // 1. Check if canonical platform is missing
  if (!canonicalPlatform) {
    return {
      status: 'MISSING',
      canonicalPlatform: null,
      conflictingSources: [],
      incompatibleProposalIds: [],
      incompatibleCount: 0,
      warnings: ["Aucune plateforme cible n'est définie pour ce projet."],
      recommendation: "Veuillez sélectionner et confirmer une plateforme cible (Application Mobile ou Application Web) dans les paramètres du projet.",
    };
  }

  // 2. Check proposals for contradictions
  proposals.forEach((p) => {
    // Check proposal's targetPlatforms array or single targetPlatform property
    const propPlatforms: TargetPlatform[] = p.targetPlatforms || ((p as any).targetPlatform ? [(p as any).targetPlatform] : []);
    
    if (propPlatforms.length > 0) {
      const hasMismatch = propPlatforms.some((tp) => tp !== canonicalPlatform);
      if (hasMismatch) {
        incompatibleProposalIds.push(p.id);
        conflictingSources.push({
          source: 'PROPOSAL',
          id: p.id,
          title: p.title,
          declaredPlatform: propPlatforms.join(', '),
          reason: `La proposition '${p.title}' (ID: ${p.id}) déclare la plateforme ${propPlatforms.join(', ')} qui contredit la cible canonique ${canonicalPlatform}.`,
        });
      }
    }
  });

  // 3. Check brief items / text for keyword signals
  const ideaText = project?.ideaText || "";
  const mobileKeywords = ["android", "expo", "react native", "application mobile", "smartphone", "ios", "play store", "app store"];
  const webKeywords = ["navigateur", "web app", "site web", "next.js", "browser", "desktop"];

  if (canonicalPlatform === "WEB_NEXTJS") {
    const mentionsMobile = mobileKeywords.some((kw) => ideaText.toLowerCase().includes(kw));
    if (mentionsMobile) {
      warnings.push("Le brief initial contient des termes évoquant une application mobile (Android/Expo) alors que la plateforme canonique est WEB_NEXTJS.");
      conflictingSources.push({
        source: 'BRIEF',
        id: project?.id || 'brief-source',
        title: 'Brief du projet',
        declaredPlatform: 'ANDROID_EXPO (déduit du texte)',
        reason: "Termes 'Android/Mobile/Expo' détectés dans la description du brief.",
      });
    }
  } else if (canonicalPlatform === "ANDROID_EXPO") {
    const mentionsWeb = webKeywords.some((kw) => ideaText.toLowerCase().includes(kw));
    if (mentionsWeb) {
      warnings.push("Le brief initial contient des termes évoquant une application web alors que la plateforme canonique est ANDROID_EXPO.");
      conflictingSources.push({
        source: 'BRIEF',
        id: project?.id || 'brief-source',
        title: 'Brief du projet',
        declaredPlatform: 'WEB_NEXTJS (déduit du texte)',
        reason: "Termes 'Web/Next.js/Navigateur' détectés dans la description du brief.",
      });
    }
  }

  const isContradictory = conflictingSources.length > 0;

  if (isContradictory) {
    return {
      status: 'CONTRADICTORY',
      canonicalPlatform,
      conflictingSources,
      incompatibleProposalIds,
      incompatibleCount: incompatibleProposalIds.length,
      warnings: [
        ...warnings,
        `${conflictingSources.length} source(s) de contradiction détectée(s) (${incompatibleProposalIds.length} proposition(s) incompatible(s)).`
      ],
      recommendation: `Examinez les contradictions ci-dessus. Vous pouvez confirmer la plateforme canonique (${canonicalPlatform === 'ANDROID_EXPO' ? 'Application Mobile' : 'Application Web'}) dans les paramètres du projet sans supprimer vos données métier.`,
    };
  }

  return {
    status: 'CONFIRMED',
    canonicalPlatform,
    conflictingSources: [],
    incompatibleProposalIds: [],
    incompatibleCount: 0,
    warnings: [],
    recommendation: `La plateforme cible ${canonicalPlatform} est confirmée et cohérente avec toutes les propositions du projet.`,
  };
}
