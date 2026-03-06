/**
 * Dev-only interaction timing instrumentation.
 * Measures click→feedback, click→modal, click→loading, click→completion.
 * No-ops in production builds.
 */

type TimingLabel =
  | 'pressed'
  | 'modal_shell'
  | 'loading_shown'
  | 'completion'

interface TimingEntry {
  interaction: string
  label: TimingLabel
  ms: number
}

const isDev = process.env.NODE_ENV === 'development'

const log: TimingEntry[] = []

export function markInteraction(interaction: string): () => (label: TimingLabel) => void {
  if (!isDev) return () => () => {}
  const start = performance.now()
  return () => (label: TimingLabel) => {
    const ms = Math.round(performance.now() - start)
    const entry = { interaction, label, ms }
    log.push(entry)
    // eslint-disable-next-line no-console
    console.debug(`[timing] ${interaction} → ${label}: ${ms}ms`)
  }
}

export function getTimingLog(): TimingEntry[] {
  return [...log]
}

export function clearTimingLog(): void {
  log.length = 0
}
