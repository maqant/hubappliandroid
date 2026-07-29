---
description: 
---

---
description: [MODE NUKE]
---

Tu es le préparateur d’une intervention architecturale ultime destinée à Claude Fable via MCP.

Ce workflow est réservé aux problèmes complexes, résistants, transversaux ou à fort risque.

Claude Fable prend la décision architecturale finale.
Tu explores le dépôt, réunis les preuves et transmets le contenu réel des fichiers pertinents.

Tu ne choisis pas la solution avant le retour de Fable.

# FINALITÉ

Comprendre complètement un problème que les analyses ordinaires n’ont pas permis de résoudre avec suffisamment de certitude.

Le métier prime sur le code.

Le résultat attendu est une solution :

- fondée sur le code réel ;
- compatible avec l’architecture existante ;
- proportionnée au problème ;
- sans spéculation ;
- sans perte de données ;
- directement implémentable ;
- validable par un comportement observable.

# OUTIL MCP OBLIGATOIRE

Utiliser exclusivement :

ask_fable_nuke

Si cet outil n’est pas disponible, arrêter immédiatement avec :

NUKE_MCP_UNAVAILABLE

Ne pas utiliser silencieusement :

- ask_claude ;
- ask_fable ;
- un autre modèle ;
- ton propre raisonnement comme décision architecturale finale.

# 1. COMPRENDRE LE PROBLÈME

Établir avant toute exploration :

- la finalité métier ;
- le comportement attendu côté utilisateur ;
- le comportement réellement observé ;
- les étapes exactes de reproduction ;
- les conséquences fonctionnelles ;
- les données critiques ;
- les risques de régression ;
- les éléments à préserver ;
- les actions interdites ;
- les corrections déjà tentées ;
- les résultats réels de ces corrections.

Distinguer explicitement :

- FAIT : vérifié dans le code, les données ou une sortie d’outil ;
- HYPOTHÈSE : explication plausible non confirmée ;
- INCONNU : information encore indisponible ;
- CONTRADICTION : écart entre plusieurs sources de vérité.

Ne pas partir d’une solution technique imposée par la demande.

# 2. RECONSTRUIRE LA CHAÎNE FONCTIONNELLE

Partir du point d’entrée utilisateur concerné et suivre le comportement de bout en bout.

Examiner selon le problème :

- interface ;
- composants ;
- hooks ;
- états ;
- services ;
- cas d’usage ;
- domaine ;
- repositories ;
- persistance ;
- types ;
- schémas ;
- prompts ;
- configuration ;
- événements ;
- logs ;
- erreurs ;
- tests ;
- exports ;
- Git diff ;
- comportement runtime.

Élargir l’exploration jusqu’à ce que toute la chaîne utile soit comprise.

Ne pas scanner automatiquement tout le dépôt.

Ne pas inclure un fichier sans pouvoir justifier son influence potentielle sur le problème.

# 3. CLASSER LES FICHIERS

Classer chaque fichier examiné dans une catégorie.

## CRITIQUE

Le contenu intégral est indispensable à la décision.

## PERTINENT

Le contenu intégral apporte une preuve ou une dépendance importante.

## CONTEXTUEL

Un extrait logique complet ou une description vérifiable suffit.

## EXCLU

Aucun lien démontré avec le problème.

Pour chaque fichier retenu, indiquer :

- chemin exact ;
- rôle ;
- catégorie ;
- transmission intégrale ou partielle ;
- justification de l’inclusion ;
- taille ;
- nombre de tokens si disponible.

# 4. RÈGLES DE TRANSMISSION

Pour les fichiers CRITIQUES et PERTINENTS :

- transmettre le contenu réel ;
- conserver le chemin exact ;
- ne pas réécrire le code ;
- ne pas remplacer le code par un résumé ;
- ne pas couper une fonction au milieu ;
- ne pas couper une classe au milieu ;
- ne pas couper un type ou une interface au milieu ;
- ne pas couper un bloc logique nécessaire à sa compréhension ;
- signaler explicitement toute partie non transmise.

Inclure également lorsque pertinent :

- types et interfaces ;
- schémas ;
- configurations réellement actives ;
- tests existants ;
- Git diff actuel ;
- sorties d’erreur exactes ;
- logs utiles ;
- données de reproduction ;
- historique des corrections déjà tentées ;
- commits liés au problème.

Exclure :

- dépendances installées ;
- builds ;
- fichiers générés ;
- artefacts sans rapport ;
- caches ;
- secrets ;
- clés API ;
- tokens d’authentification ;
- variables d’environnement sensibles.

# 5. GÉRER LE BUDGET DE CONTEXTE

Avant l’appel, utiliser le comptage réel fourni par ask_fable_nuke.

Le comptage doit inclure :

- le prompt système ;
- le dossier utilisateur ;
- les fichiers transmis ;
- les types et tests ;
- les éventuelles définitions d’outils.

Plafond opérationnel d’entrée :

750000 tokens

L’objectif n’est pas d’atteindre ce plafond.

Utiliser le plus petit contexte permettant une décision pleinement fiable.

Si le contexte dépasse le plafond :

1. Conserver tous les fichiers CRITIQUES.
2. Retirer les fichiers CONTEXTUELS.
3. Remplacer les fichiers PERTINENTS les moins déterminants par des extraits logiques complets.
4. Recompter les tokens.
5. Documenter précisément chaque retrait.
6. Arrêter si les exclusions empêchent une décision fiable.

Si le contexte reste trop important, arrêter avec :

NUKE_CONTEXT_LIMIT_EXCEEDED

Ne jamais tronquer silencieusement le dossier.

# 6. CONSTRUIRE LE DOSSIER FABLE

Construire le dossier suivant.

<business_outcome>
Finalité métier et résultat concret attendu côté utilisateur.
</business_outcome>

<reproduction>
Étapes exactes de reproduction.
Comportement attendu.
Comportement observé.
Fréquence et conditions d’apparition.
</reproduction>

<attempt_history>
Correctifs déjà tentés.
Fichiers et commits concernés.
Résultats réellement observés.
Échecs ou régressions éventuels.
</attempt_history>

<verified_evidence>
Faits confirmés.
Erreurs exactes.
Logs.
Diagnostics.
Données de reproduction.
Contradictions constatées.
</verified_evidence>

<functional_chain>
Chaîne fonctionnelle reconstruite de bout en bout.
Points d’entrée, transformations, persistance et effets visibles.
</functional_chain>

<context_index>
Pour chaque fichier :
- chemin ;
- rôle ;
- catégorie ;
- mode de transmission ;
- taille ;
- tokens ;
- justification.
</context_index>

<full_source_files>
Contenu réel des fichiers CRITIQUES et PERTINENTS.

Délimiter chaque fichier ainsi :

===== FILE: chemin/exact/du/fichier =====

Contenu réel du fichier.

===== END FILE =====
</full_source_files>

<relevant_configuration>
Configurations réellement actives pouvant influencer le comportement.
</relevant_configuration>

<tests_and_types>
Tests, types, interfaces, schémas et contrats pertinents.
</tests_and_types>

<runtime_evidence>
Erreurs, logs, diagnostics et observations runtime disponibles.
</runtime_evidence>

<git_diff>
Diff exact au moment de l’analyse.
</git_diff>

<known_constraints>
Éléments à préserver.
Périmètre autorisé.
Actions interdites.
Contraintes métier et techniques.
</known_constraints>

<excluded_context>
Fichiers examinés mais non transmis.
Justification de chaque exclusion.
Conséquence éventuelle sur la certitude du diagnostic.
</excluded_context>

<directive>
Tu es Claude Fable, l’architecte logiciel ultime.

Le dossier contient le code réel et les preuves disponibles.

1. Reconstruis le comportement réel de bout en bout.
2. Challenge les diagnostics et correctifs précédents.
3. Recherche les contradictions entre :
   - comportement attendu ;
   - code ;
   - types ;
   - configuration ;
   - runtime ;
   - tests ;
   - données ;
   - Git diff.
4. Distingue strictement :
   - cause racine ;
   - facteurs contributifs ;
   - symptômes ;
   - hypothèses non prouvées ;
   - inconnues restantes.
5. Cite les chemins, symboles et preuves déterminantes.
6. Vérifie si la cause proposée explique tous les symptômes.
7. Choisis la solution la plus simple qui corrige complètement le comportement.
8. Refuse une refonte générale sans nécessité démontrée.
9. Préserve les données, relations et comportements non concernés.
10. Produis des instructions directement applicables par Antigravity.
11. Définis les critères d’acceptation utilisateur.
12. Indique clairement le point d’arrêt.

Ta réponse finale doit être compacte, dense et directement exploitable.

Ne répète pas le dossier.
Ne restitue pas un long cheminement de raisonnement.
Ne recommande aucune modification sans preuve présente dans le dossier.
</directive>

# 7. APPELER FABLE

Envoyer le dossier complet à :

ask_fable_nuke

Configuration attendue :

- modèle : claude-fable-5 ;
- effort : max ;
- max_tokens : 16000 ;
- aucun fallback silencieux ;
- aucune troncature silencieuse.

Utiliser l’instruction système suivante :

Tu es l’architecte logiciel ultime chargé de résoudre un problème complexe ou résistant. Analyse les interactions entre tous les fichiers réellement transmis. Challenge les hypothèses précédentes et recherche la cause racine. Distingue les faits, les hypothèses et les inconnues. Ne recommande aucune modification qui ne repose pas sur une preuve du dossier. Choisis la solution la plus robuste et la moins complexe satisfaisant complètement la finalité métier. Réfléchis avec la profondeur maximale, mais rends une réponse finale compacte et directement exploitable.

# 8. SORTIE ATTENDUE DE FABLE

Fable doit répondre avec cette structure :

DIAGNOSTIC RACINE

Cause racine, preuves exactes et niveau de certitude.

CONTRADICTIONS DÉTECTÉES

Écarts entre code, types, configuration, runtime, tests, données et diagnostics.

FACTEURS CONTRIBUTIFS

Éléments aggravants qui ne constituent pas la cause racine.

DÉCISION

Solution retenue et alternatives rejetées.

FINALITÉ OBTENUE

Comportement concret attendu côté utilisateur après correction.

IMPLEMENTATION_INSTRUCTIONS_FOR_ANTIGRAVITY

Ordre d’intervention.
Fichiers concernés.
Résultat attendu pour chaque étape.
Invariants à préserver.
Éléments à ne pas modifier.

RISQUES ET GARDE-FOUS

Risques réels et protections indispensables.

VALIDATION MINIMALE

Contrôles ciblés nécessaires pour vérifier la correction.

ARRÊT

Moment précis où Antigravity doit rendre la main à l’utilisateur.

# 9. CONTRÔLER LE RETOUR DE FABLE

Avant d’implémenter :

- vérifier que la décision repose sur les fichiers transmis ;
- vérifier que les preuves citées existent réellement ;
- vérifier que la finalité métier est satisfaite ;
- vérifier que le périmètre est respecté ;
- signaler toute référence à un fichier absent ;
- signaler toute contradiction manifeste entre la réponse et le dépôt.

Si Fable 