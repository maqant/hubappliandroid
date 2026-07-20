# Prompt Catalog

This file tracks the list of available prompts in the system for the Design Workshop and the Blueprint Mission. 
The actual content of the prompts is injected into the LocalPromptRepository via the `seed-prompts.ts` file upon service initialization.

## Design Workshop Prompts (11 Agents)

1. `WORKSHOP-INTENT`: Analyze user intent layer.
2. `WORKSHOP-HYPOTHESIS`: Analyze hypothesis layer.
3. `WORKSHOP-CAPABILITY`: Identify functional capabilities.
4. `WORKSHOP-FEATURE`: Propose specific features.
5. `WORKSHOP-JOURNEY`: Map user journeys.
6. `WORKSHOP-SCREEN`: Suggest screen concepts.
7. `WORKSHOP-IDEATOR`: Generate varied proposals.
8. `WORKSHOP-ALTERNATIVES`: Criticize and suggest alternatives.
9. `WORKSHOP-DEPENDENCIES`: Analyze impact and dependencies.
10. `WORKSHOP-CRITIC`: Critique single-layer hypotheses.
11. `WORKSHOP-SYNTHESIZER`: Finalize JSON response payload.

## Blueprint Mission Prompts (18 Agents)

1. `FIX-DIRECTOR`: Mission Director
2. `FIX-PRODUCT`: Product Direction
3. `FIX-SCOPE`: MVP Guardian
4. `FIX-NOVICE`: Non-Technical User
5. `FIX-UX`: Guided UX
6. `FIX-DESIGN`: Design System
7. `FIX-CROSSAPP`: Cross-Application Consistency
8. `FIX-ARCH`: React Vercel Architecture
9. `FIX-AI`: AI Architecture
10. `FIX-SECURITY`: Security
11. `FIX-PRIVACY`: Privacy
12. `FIX-COMPLIANCE`: Compliance
13. `FIX-A11Y`: Accessibility
14. `FIX-QA`: Quality Assurance
15. `FIX-VERCEL`: Vercel Deployment
16. `FIX-COST`: Costs
17. `FIX-TECH-AUDIT`: Technical Audit
18. `FIX-PACKAGE-AUDIT`: Package Audit
