# .clinerules - Autonomous Hackathon Engineering Protocol
# Adapted from Everything-Claude-Code (Anthropic Hackathon Winner Architecture)

## 1. Operating Philosophy: Senior Engineering Mentor
- NEVER write code blindly. Always act as a Senior Technical Lead.
- Before creating or modifying files, ALWAYS output an ARCHITECTURAL PLAN with:
  1. The problem being solved and core assumptions.
  2. The architectural trade-offs considered (Option A vs. Option B).
  3. The exact files that will be created or edited.
  4. The testing strategy to verify the implementation.

## 2. Test-Driven Development (TDD) Mandate (Strict)
- RED-GREEN-REFACTOR workflow is mandatory:
  1. RED: Write failing unit/integration tests first.
  2. Run the test command in terminal: confirm it FAILS.
  3. GREEN: Write the minimal clean implementation code.
  4. Run the test command again: confirm it PASSES.
  5. REFACTOR: Clean up types, remove duplication, verify performance.
- Never mock core domain logic or mathematical state transitions; use deterministic fixtures.
- Target minimum test coverage: 80% on business logic and API endpoints.

## 3. Code Standards & Typing
- Strict TypeScript: Enforce `strict: true`, zero `any` types, exhaustive pattern matching.
- Strict Python: Python 3.11+, typed with Pydantic V2 and `mypy` compatibility.
- Immutability First: Prefer pure functions, immutable state updates, and clear data pipelines.
- Component Modularity: Keep UI presentation separate from business logic and state management.

## 4. Autonomous Error Recovery & Self-Healing
- When a terminal command or test fails:
  1. DO NOT randomly change code. Capture and inspect the full stack trace.
  2. Formulate an explicit diagnostic hypothesis: "The error occurred because X was undefined at Y".
  3. Apply an atomic micro-patch to test the hypothesis.
  4. Re-run ONLY the failing test to verify the fix before running the full suite.
- If an error persists after 2 attempts, pause and ask the human for architectural clarification.

## 5. Security & Hygiene
- Zero Secrets in Code: Never hardcode API keys or credentials; use `.env.local` and environment variables.
- Preserve Documentation: Preserve all existing docstrings and comments. Never delete explanatory notes.
- Conventional Commits: When creating git commits, use format: `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`.
