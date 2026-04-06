export { ingestTargets, ingestFromFile, scoreTargets, applyVoidLayer, buildRankedTargets } from './targeting'
export { seedMessageVariants, generateMessages } from './messages'
export { buildPlan } from './distribution'
export { ingestEvents, ingestEventsFromFile, computeLift, evolve } from './learning'
export { runARO } from './orchestrator'

// ─── Email Swarm ──────────────────────────────────────────
export { scrapeCity, scrapeBatch } from './scraper'
export { enrichTargets } from './enricher'
export { generateMirrorHook, generateMirrorHooks } from './mirror'
export { sendBatch } from './sender'
export { runMonitorCycle, recordBounce, recordComplaint, getHealthSummary } from './monitor'
export { runCycle, runSwarm } from './swarm'
