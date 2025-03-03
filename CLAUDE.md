# Radio Project Guidelines

## Commands

- Build: `bun run build` - Builds project with tsup
- Dev: `bun run dev` - Watches for changes and rebuilds
- Typecheck: `bun run typecheck` - Type checks without emitting
- Lint: `bun run lint` - Lints TypeScript files
- Test: `bun run test` - Runs tests with vitest
- DB Commands:
    - `bun run db:local:seed` - Seeds local database
    - `bun run db:gen-types` - Generates TypeScript types from Supabase
    - `bun run db:local:init` - Resets DB, generates types, and seeds data

## Code Style

- TypeScript ESM modules with explicit types for all exports
- Domain-specific code organized under `src/lib/`
- Utility functions in `src/utils/`
- Use JSDoc comments for public APIs
- Export interfaces/types from dedicated `types.ts` files
- Use camelCase for variables/functions, PascalCase for types/interfaces
- Error handling with descriptive error messages
- Prefer async/await over Promises
- Prefix unused variables with underscore
- Explicit null checks with optional chaining
