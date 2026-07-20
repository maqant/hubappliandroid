# Changelog

## [0.4.0] - 2026-07-20

### Ajouts (FEAT)
- **Mode Essaim d'Idéation** : Le Workshop gère maintenant une intensité d'idéation (Standard, Abondante, Exhaustive) qui génère des idées divergentes depuis plusieurs perspectives (Visionnaire, Pragmatique, etc.) avant de synthétiser le résultat.
- **Propositions Interactives** : Les propositions s'affichent sous forme de cartes interactives (Checkbox ou focus). Possibilité d'accepter, refuser, reporter ou modifier une proposition, y compris en sélection groupée.
- **Filiation des idées** : Modèle de propositions supportant la notion d'idées parentes, d'idées enfants et préservant l'origine (agent ou perspective) de l'idée pour garantir la diversité.
- **Questions et Hypothèses interactives** : Boutons "Confirmer", "Corriger" ou "Refuser" sur les hypothèses pour permettre de valider en temps réel ce que le hub imagine.
- **Persistance en temps réel** : Les propositions candidates (PROPOSED) sont directement sauvegardées lors de la génération.

## [0.3.0] - 2026-07-20

### Ajouts (FEAT)
- **Refonte de l'architecture des prompts** : Centralisation de tous les templates de prompt dans un `LocalPromptRepository`. Les agents récupèrent dynamiquement leurs instructions et leurs variables de contexte.
- **Atelier de Conception Assistée Dynamique** : Le frontend transmet la couche sélectionnée (INTENTION, HYPOTHESIS, etc.) au backend. Le backend orchestre dynamiquement le passage de relais (router) entre les sous-agents spécialisés de l'atelier pour produire une proposition validée.
- **Injection des variables de contexte** : Ajout du support pour les variables comme `{{TARGET_PLATFORM}}`, `{{LANGUAGE}}`, `{{PROJECT_TITLE}}` et `{{CONFIRMED_ITEMS_JSON}}`.

### Modifiés (REFACTOR)
- **Mission Executor** : Mise à jour de `executeTask` pour puiser dans le Prompt Registry plutôt que d'utiliser des instructions codées en dur.
- **Planner** : Retrait des `purpose` codés en dur pour les agents fixes (18 agents Blueprint).

### Corrections (FIX)
- Affichage dynamique de l'état "Layer sélectionné" dans le Design Workshop.
- Transmission de `promptId` et `promptVersion` dans l'objet `diagnostic` pour une meilleure traçabilité.
