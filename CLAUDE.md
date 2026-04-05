# FOOTPRINT — Claude Code Project Rules

## Superpowers Methodology (MANDATORY)

All development sessions on footprint follow the Superpowers methodology.
Plugin installed at: `~/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/superpowers/`

### Workflow Order (non-negotiable)

1. **Brainstorm** before writing any code — use `superpowers:brainstorming` skill
2. **Spec approval** before implementation — write to `docs/superpowers/specs/`
3. **Detailed plan** before subagents touch files — use `superpowers:writing-plans`, write to `docs/superpowers/plans/`
4. **TDD** for all implementation — failing test -> pass -> commit (red/green/refactor)
5. **Two-stage review** after each task — spec compliance review, then code quality review
6. **Verify before declaring done** — use `superpowers:verification-before-completion`

### Execution Method

Use **subagent-driven-development** (recommended path) for plan execution:
- Fresh subagent per task
- Two-stage review (spec compliance first, code quality second)
- Max 3 review iterations before escalating to human

### Git Worktrees

- Location: `.claude/worktrees/` (already configured, project-local)
- Feature work in isolated worktrees with dedicated branches
- Never commit directly to main without explicit human consent
- Run full test suite before any merge

### TDD Rules

- NO production code without a failing test first
- Watch each test fail before implementing
- Write minimal code to pass — nothing extra
- Refactor only after green
- No mocks unless unavoidable

### Code Review Protocol

- Request review after each task and before merge
- Critical issues: fix immediately, blocks progress
- Important issues: fix before proceeding
- Minor issues: note for later
- No performative agreement ("Great point!", "You're right!") — just fix and show

### Verification Rules

- NO completion claims without fresh verification evidence
- Run the actual command, read the full output, check exit code
- "Should pass" / "probably works" / "I'm confident" are not verification
- Agent reports are not verification — verify independently

### Design Document Locations

- Specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Plans: `docs/superpowers/plans/YYYY-MM-DD-<feature>-plan.md`

## Project Context

- **Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Stripe, Vercel
- **Test frameworks:** Vitest (unit), Playwright (e2e)
- **Dev server:** `npm run dev` on port 3000
- **What not to touch:** Anything currently working. Superpowers governs future work only.
