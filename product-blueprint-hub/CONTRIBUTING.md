# Contributing

## Development

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev`
4. Open http://localhost:3000

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- No `any` types

## Testing

- Unit tests: `npm test`
- E2E tests: `npm run test:e2e`
- All tests must pass before committing

## Architecture Rules

- Domain layer has no external dependencies
- UI never reads localStorage directly
- All AI calls go through Model Gateway
- All API inputs validated with Zod
- No secrets in client-side code
