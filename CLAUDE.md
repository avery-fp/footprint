# FOOTPRINT — Claude Code Project Rules

Two layers govern all work in this repo:
- **ae Execution Standard** — judgment filter: should this task ship now?
- **Superpowers Methodology** — process: how to execute once the task clears the gate.

Both apply at all times.

---

## ae Execution Standard

Behavioral guidelines merged from two sources: Karpathy's LLM coding principles (anti-regression, anti-bloat) and ae's distribution-decision filter (anti-polish-masquerading-as-blocking). Both apply at all times.

### 0. Before Any Task — The One Question

**Does this prevent someone from typing `footprint.onl/username` and paying $10?**

If yes — it's a blocker. Ship it first.
If no — it's polish. Flag it. Don't touch it until distribution has fired.

The completion asymptote is real: every polish task is legitimate, and none of them are blockers. Name it when it appears. Do not let "one more fix" delay the binary moment where the market responds or doesn't.

**Blocker criteria** — auth fails for a new user, claim flow breaks, ARO can't execute, email engine fails, the address doesn't resolve.

**Polish criteria** — everything else. Visual regressions that don't break function, aspect ratios, tile sizing, button colors, text truncation without functional impact, performance optimizations, analytics gaps.

**The lightswitch check** — before accepting any task, surface this: Is ARO ready to fire? Is the email contact list loaded? Is auth clean for strangers, not just ae? If all three yes, the task is polish and distribution should fire first.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing, state your assumptions explicitly. If uncertain, ask. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. Push back when warranted. If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code: don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style, even if you'd do it differently. If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans: remove imports, variables, and functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals. "Fix the bug" becomes "write a test that reproduces it, then make it pass." "Add validation" becomes "write tests for invalid inputs, then make them pass."

For multi-step tasks, state a brief plan with explicit verification checkpoints before touching any code. Strong success criteria allow independent looping. Weak criteria require constant clarification and produce regressions.

### 5. Nothing Is Done Until Confirmed Live on Production

Typecheck passing is not proof. Build succeeding is not proof. The only proof is: open an incognito window, go to footprint.onl, and verify the behavior exists in production. If it hasn't been verified live, it isn't done.

---

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

---

## Project Context

Footprint is a permanent digital identity platform. Free to build, $10 to claim a clean permanent address at footprint.onl/username. Product is launch-ready; distribution is the only remaining gap.

- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase, Stripe, Vercel
- **Test frameworks:** Vitest (unit), Playwright (e2e)
- **Dev server:** `npm run dev` on port 3000
- **What not to touch:** Anything currently working. The ae standard and Superpowers methodology govern future work only.
- **ae standard for copy, comments, and communication:** no padding, no hedging, no over-qualification. Compression after discovery, not before.

---

## Anti-Entropy Rules

Derived from session diagnostics (edit-thrashing, error-loop, negative-drift patterns).

- **One edit pass.** Read the full file before editing. Plan all changes, then make one complete edit. If you've edited the same file 3+ times in a session, stop and re-read the original request.
- **Fail fast.** After 2 consecutive tool failures, stop and change approach entirely. Explain what failed, try a different strategy.
- **No drift.** Every few turns, re-read the original request to confirm you haven't drifted from the goal.
- **Complete the task.** If the request covers multiple things, implement all of them before presenting results.
