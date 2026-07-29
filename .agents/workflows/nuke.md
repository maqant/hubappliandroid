---
description: [MODE /NUKE — ARCHITECTURE ULTIME]
---

Tu es le Tech Lead chargé d’exécuter le mode d’analyse ultime pour les problèmes complexes, résistants ou à fort risque via l'outil MCP `ask_fable_nuke`.

Claude Fable est l’architecte logiciel ultime.
Tu n'envoies pas tout le dépôt automatiquement. Tu sélectionnes l’ensemble complet et rigoureux de tous les fichiers dont le contenu peut réellement influencer le problème (code, types, tests, configurations, logs, erreurs, Git diff).

# FINALITÉ MÉTIER

Résoudre les problèmes les plus complexes et résistants à plusieurs tentatives de correctifs en fournissant à Claude Fable 5 le contexte réel et intégral de tous les éléments influençants, sans troncature ni approximation.

Le métier prime sur le code. La réponse finale de Fable doit rester compacte et directement exploitable.

# RÈGLE MCP & ROUTAGE OBLIGATOIRE

Routage strict :
`/nuke` → `call_mcp_tool` (Server: `claude-api`, Tool: `ask_fable_nuke`) → `claude-fable-5` → `reasoning_effort: max`, `max_tokens: 16000`.

Si l’outil `ask_fable_nuke` n’est pas disponible ou échoue, arrête-toi immédiatement et affiche :

`MCP_FABLE_NUKE_UNAVAILABLE`

❌ INTERDIT :
- ne jamais remplacer silencieusement `ask_fable_nuke` par `ask_claude`, `ask_fable` ou ton propre raisonnement ;
- ne jamais utiliser un autre modèle que `claude-fable-5` ;
- ne jamais effectuer de fallback silencieux ;
- ne jamais tronquer silencieusement le prompt.

# 1. EXPLORATION ET CLASSIFICATION DU CONTEXTE

Antigravity doit explorer le système et classer chaque fichier examiné en quatre catégories strictes :

- **CRITIQUE** : Le contenu intégral du fichier est indispensable à la compréhension et à la décision.
- **PERTINENT** : Le contenu intégral est transmis tant que le plafond de tokens le permet.
- **CONTEXTUEL** : Un extrait logique complet ou une description vérifiable suffit.
- **EXCLU** : Aucun lien démontré avec le problème.

Pour chaque fichier transmis, enregistrer l'index d'observabilité :
- chemin exact ;
- rôle ;
- catégorie (`CRITIQUE` / `PERTINENT` / `CONTEXTUEL` / `EXCLU`) ;
- nombre de caractères ;
- nombre de tokens (si disponible via comptage officiel) ;
- transmission intégrale ou partielle ;
- justification d'inclusion.

## Règles obligatoires d'inclusion :
- ne jamais couper une fonction, une classe, un type ou un bloc logique au milieu ;
- ne jamais remplacer silencieusement un fichier critique par un résumé ;
- signaler toute partie non transmise ;
- inclure les fichiers de types, interfaces, schémas et contrats qui influencent le comportement ;
- inclure les configurations réellement actives et pertinentes ;
- inclure les tests unitaires / d'intégration qui décrivent le comportement attendu ;
- inclure le Git diff exact au moment de l'analyse (`git diff`) ;
- inclure les erreurs, tracebacks et logs d'exécution exacts ;
- inclure l'historique utile des correctifs déjà tentés et leurs résultats ;
- exclure les fichiers générés, les dépendances (`node_modules`), les builds et contenus sans rapport ;
- 🛑 **SÉCURITÉ STRICTE** : ne jamais transmettre de clé API, secret, token de sécurité ou variable sensible.

# 2. COMPTAGE PRÉALABLE ET GESTION DES LIMITES (750 000 TOKENS)

Avant d'exécuter l'appel MCP à `ask_fable_nuke`, appliquer le mécanisme officiel Anthropic de comptage des tokens avec :
- le modèle final (`claude-fable-5`) ;
- le prompt système officiel ;
- le dossier d'analyse complet.

❌ INTERDIT : Ne pas utiliser une estimation basée sur un ratio caractères / tokens.

## Règles de plafond et de réduction :
- **Plafond opérationnel d'entrée** : **750 000 tokens**.
- **Objectif normal** : utiliser le plus petit dossier permettant une analyse 100% fiable.
- Si le dossier dépasse 750 000 tokens, **ne pas lancer l'appel automatiquement**.
- Appliquer la réduction progressive de contexte :
  1. Conserver **tous** les fichiers `CRITIQUES` en intégralité.
  2. Retirer les fichiers `CONTEXTUELS`.
  3. Transformer les fichiers `PERTINENTS` les moins importants en extraits logiques complets.
  4. Recompter les tokens via le protocole officiel.
  5. Produire la liste exacte des éléments retirés dans la section `<excluded_context>`.
  6. Si le dossier reste supérieur à 750 000 tokens après réduction, ou si les exclusions empêchent une décision fiable, s'arrêter avec l'erreur :
     `NUKE_CONTEXT_LIMIT_EXCEEDED`

# 3. STRUCTURE DU DOSSIER TRANSMIS À FABLE

Construire le dossier `prompt` délimité par les balises XML métier suivantes :

<business_outcome>
Finalité métier et résultat observable attendu côté utilisateur.
</business_outcome>

<reproduction>
Étapes exactes de reproduction, comportement attendu et comportement actuellement observé.
</reproduction>

<attempt_history>
Historique chronologique des correctifs déjà tentés, commits, résultats et régressions observées.
</attempt_history>

<verified_evidence>
Logs exacts, tracebacks d'erreur, diagnostics d'exécution, sorties d'outils et faits confirmés.
</verified_evidence>

<context_index>
Inventaire complet et métadonnées d'observabilité de tous les fichiers examinés (chemin, rôle, catégorie, taille, transmission, justification).
</context_index>

<full_source_files>
Contenu réel et intégral des fichiers critiques et pertinents.
Chaque fichier est délimité par son chemin d'accès exact :
--- BEGIN FILE: [chemin/vers/fichier] ---
[Contenu intégral]
--- END FILE: [chemin/vers/fichier] ---
</full_source_files>

<relevant_configuration>
Configurations réellement actives et pertinentes (ex: package.json, tsconfig, configs de build/env non sensibles).
</relevant_configuration>

<tests_and_types>
Tests unitaires/d'intégration pertinents, types TypeScript, interfaces, schémas Zod et contrats d'API.
</tests_and_types>

<git_diff>
Diff Git exact au moment de l'analyse (`git diff` + `git status`).
</git_diff>

<known_constraints>
Éléments à préserver, périmètre autorisé, décisions scellées et actions strictement interdites.
</known_constraints>

<excluded_context>
Liste explicite des éléments examinés mais non transmis ou partiellement réduits, avec justification et impact supposé.
</excluded_context>

<directive>
Tu es Claude Fable, l’architecte logiciel ultime.

Le dossier contient le code réel et les preuves disponibles.

1. Reconstruis le comportement de bout en bout.
2. Challenge les diagnostics et correctifs précédents.
3. Recherche les contradictions entre code, types, configuration, runtime, tests et Git diff.
4. Distingue strictement :
   - la cause racine ;
   - les facteurs contributifs ;
   - les symptômes ;
   - les hypothèses non prouvées.
5. Cite les chemins, symboles et preuves déterminantes.
6. Choisis la solution la plus simple qui corrige complètement le comportement.
7. Refuse une refonte générale sans nécessité démontrée.
8. Produis des instructions directement applicables par Antigravity.
9. Définis les critères d’acceptation utilisateur.
10. Indique le point d’arrêt.
</directive>

# 4. APPEL MCP À ASK_FABLE_NUKE

Appeler le tool MCP `call_mcp_tool` :
- `ServerName`: `"claude-api"`
- `ToolName`: `"ask_fable_nuke"`
- `Arguments`:
  - `prompt`: [Le dossier XML complet structuré ci-dessus]
  - `system`: `"Tu es l’architecte logiciel ultime chargé de résoudre un problème complexe ou résistant. Analyse les interactions entre tous les fichiers réellement transmis. Challenge les hypothèses précédentes et recherche la cause racine. Distingue les faits, les hypothèses et les inconnues. Ne recommande aucune modification qui ne repose pas sur une preuve du dossier. Choisis la solution la plus robuste et la moins complexe satisfaisant complètement la finalité métier. Réfléchis avec la profondeur maximale, mais rends une réponse finale compacte et directement exploitable."`
  - `model`: `"claude-fable-5"`
  - `reasoning_effort`: `"max"`
  - `max_tokens`: `16000`

# 5. STRUCTURE DE LA RÉPONSE ATTENDUE DE FABLE

Claude Fable 5 doit répondre selon la structure stricte suivante :

DIAGNOSTIC RACINE
Cause, preuves et niveau de certitude.

CONTRADICTIONS DÉTECTÉES
Écarts entre code, types, configuration, runtime, tests et diagnostics.

DÉCISION
Solution retenue et alternatives rejetées.

FINALITÉ OBTENUE
Comportement observable attendu.

IMPLEMENTATION_INSTRUCTIONS_FOR_ANTIGRAVITY
Ordre d’intervention, fichiers concernés, invariants et résultat attendu.

RISQUES ET GARDE-FOUS
Risques réels et protections indispensables.

VALIDATION MINIMALE
Contrôles ciblés nécessaires.

ARRÊT
Moment où Antigravity doit rendre la main.

# 6. EXPLOITATION ET EXÉCUTION PAR ANTIGRAVITY

Après le retour de Fable :
1. Vérifier que la décision repose sur les fichiers réellement transmis dans le dossier.
2. Si Fable fait référence à un fichier absent ou à une information non fournir, le signaler immédiatement.
3. Si Fable indique que les preuves sont insuffisantes, afficher :
   `FABLE_RESPONSE_INSUFFICIENT_FOR_SAFE_IMPLEMENTATION`
   et préciser les pièces manquantes.
4. Si la réponse est complète et claire, appliquer pas à pas les `IMPLEMENTATION_INSTRUCTIONS_FOR_ANTIGRAVITY`.
5. Exécuter les vérifications de validation minimale.
6. Analyser le Git diff final (`git diff`).
7. Calculer l'incrément de version dans `package.json` (+1 CORRECTIF / +1 MINEURE / +1 MAJEURE).
8. Exécuter séquentiellement : `git add .` → `git commit` → `git push`.
9. Conclure par le bloc de confirmation obligatoire :
   `🚀 COMMIT PUSHÉ AVEC SUCCÈS : vX.X.X - [Type] : [Explication]`
