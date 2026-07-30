export const AGENTS_MD_TEMPLATE = `# AGENTS.md - Hive Awareness Rule

## Portée

Ce fichier définit le comportement obligatoire de Jules et Antigravity pour tout projet généré par Product Blueprint Hub.

L'objectif est de conserver une conscience légère du produit pendant le vibe coding, sans imposer un processus administratif.

## Règle 1 - Charger la conscience du projet

Au début de chaque session ou avant une modification structurante :

1. Lire \`HIVE.md\` s'il existe.
2. Charger au minimum :
   - la promesse du produit ;
   - le périmètre MVP ;
   - l'état actuel ;
   - les décisions à respecter ;
   - l'architecture à préserver ;
   - la roadmap ;
   - les points d'extension ;
   - les limites connues.
3. Consulter les documents détaillés référencés dans \`HIVE.md\` uniquement si la tâche le nécessite.

Si \`HIVE.md\` n'existe pas, signaler brièvement son absence. Ne pas bloquer une petite correction pour cette seule raison.

## Règle 2 - Vibe coding assisté

L'utilisateur doit pouvoir formuler naturellement une demande de correction, d'ajout ou d'évolution.

Avant une modification structurante, vérifier silencieusement si la demande :

- appartient au MVP ;
- figure dans la roadmap ;
- contredit une décision ;
- modifie une architecture à préserver ;
- ferme un point d'extension important ;
- implique une fonctionnalité volontairement différée.

Une petite correction locale ne doit pas déclencher un audit général ni une lecture complète de tous les documents PBH.

## Règle 3 - Architecture et décisions à préserver

Ne pas modifier silencieusement :

- la plateforme ;
- les frontières de domaine ;
- les contrats fonctionnels ;
- les décisions architecturales scellées ;
- les exclusions ;
- la séparation entre MVP et roadmap.

Si une demande exige de modifier un de ces éléments :

1. expliquer le conflit en langage clair ;
2. indiquer l'impact concret ;
3. proposer l'option conforme la plus simple ;
4. attendre l'arbitrage de l'utilisateur avant le changement structurant.

Ne pas bloquer une correction conforme à l'architecture existante.

## Règle 4 - Deferred signifie non développé maintenant

Un élément \`DEFERRED\`, \`NEXT\` ou \`FUTURE\` peut influencer une frontière architecturale, mais ne doit pas être implémenté sans demande explicite de l'utilisateur.

Pour une évolution future :

- préserver uniquement le point d'extension utile ;
- ne pas créer d'infrastructure spéculative ;
- ne pas ajouter de compte, backend, API, abstraction ou dépendance sans besoin actuel ;
- inscrire dans \`HIVE.md\` ce qu'il faut préserver et ce qu'il ne faut pas construire maintenant.

## Règle 5 - Répondre à « Il reste quoi à faire ? »

Utiliser d'abord \`HIVE.md\`.

Répondre avec une liste courte distinguant :

- en cours ;
- reste à faire pour terminer le MVP ;
- problèmes connus ;
- prochaine évolution de roadmap, séparée du MVP.

Ne pas lancer un audit général sauf demande explicite ou incohérence manifeste du fichier.

## Règle 6 - Mise à jour de HIVE.md

Mettre à jour \`HIVE.md\` uniquement après un changement significatif :

- fonctionnalité terminée ;
- nouvelle décision structurante ;
- changement d'architecture accepté ;
- ajout, retrait ou report de périmètre ;
- limite importante découverte ;
- point d'extension ajouté ;
- étape d'implémentation terminée.

Ne pas mettre à jour \`HIVE.md\` pour une correction mineure de texte, de style ou d'espacement.

La mise à jour doit rester concise et factuelle.

## Règle 7 - Continuité PBH, Jules et Antigravity

Cycle de vie :

\`\`\`text
PBH
  -> produit le contrat, le blueprint, le plan, la roadmap et HIVE.md
Jules
  -> construit le MVP par étapes et actualise l'état utile dans HIVE.md
Antigravity
  -> corrige, compile, affine et poursuit les évolutions avec l'utilisateur
\`\`\`

PBH définit le produit.

Le code constitue l'état réel de l'implémentation.

Le compte rendu d'un agent ne remplace pas la vérification du code lorsqu'une question technique précise se pose.

En cas de doute :

consulter HIVE.md ;
consulter uniquement le document détaillé pertinent ;
comparer avec le code réel ;
signaler l'écart sans modifier silencieusement le produit.

Règle 8 - Validation proportionnée

Pour une modification de code :

exécuter le build demandé par le projet avant commit et push ;
corriger uniquement les erreurs de compilation causées par la modification ;
ne pas lancer automatiquement un audit général, une batterie E2E ou une refonte hors périmètre ;
ne pas déclarer la tâche terminée si le build obligatoire échoue.

Règle 9 - Priorité documentaire

Ordre de référence :

HIVE.md pour l'état courant et la roadmap ;
contrat produit ou baseline PBH pour la finalité fonctionnelle ;
architecture technique pour les décisions scellées ;
catalogue des fonctionnalités, parcours, écrans et critères pour le détail ;
code réel pour l'état d'implémentation.

Une divergence fonctionnelle doit être arbitrée.

Une divergence purement technique peut être corrigée dans le cadre des décisions existantes.
`;

export const HIVE_MD_TEMPLATE = `# HIVE.md

Mémoire vivante et légère du projet. Ce fichier doit rester court, factuel et utile au vibe coding.

## Produit
Nom : {{PROJECT_NAME}}
Plateforme : {{TARGET_PLATFORM}}
Baseline PBH : {{BASELINE_ID}} v{{BASELINE_VERSION}}
Promesse : {{PRODUCT_PROMISE}}
Utilisateur ou contexte principal : {{PRIMARY_USER_CONTEXT}}

## MVP retenu

{{MVP_SCOPE_SUMMARY}}

## État actuel
### Fait

{{DONE_ITEMS}}

### En cours

{{IN_PROGRESS_ITEMS}}

### Reste à faire pour terminer le MVP

{{REMAINING_MVP_ITEMS}}

## Décisions à respecter

{{ACTIVE_DECISIONS}}

## Architecture à préserver

{{SEALED_ARCHITECTURE_DECISIONS}}

## Roadmap
### Prochaine évolution probable

{{NEXT_ROADMAP_ITEMS}}

### Plus tard

{{FUTURE_ROADMAP_ITEMS}}

### Idées conservées sans engagement

{{UNCOMMITTED_IDEAS}}

## Points d'extension

{{EXTENSION_POINTS}}

Pour chaque point d'extension, préciser si possible :

ce qui doit rester possible ;
la décision actuelle à ne pas figer ;
ce qui ne doit pas être développé maintenant ;
quand réévaluer.

## Problèmes ou limites connus

{{KNOWN_ISSUES_AND_LIMITS}}

## Documents de référence

{{REFERENCE_DOCUMENTS}}

Ne consulter les documents détaillés que lorsque la tâche le nécessite.

## Dernière mise à jour
Date : {{LAST_UPDATED_AT}}
Agent : {{LAST_UPDATED_BY}}
Résumé : {{LAST_UPDATE_SUMMARY}}
`;
