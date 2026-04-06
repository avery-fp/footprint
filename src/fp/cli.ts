/**
 * CLI driver — legacy culture engine.
 *
 * Old distribution lanes (mint, ignite, distribute) have been removed.
 * The Email Swarm is now the sole distribution channel.
 * See: cli/swarm.ts  →  npm run aro:swarm
 */

export async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║         FOOTPRINT CULTURE ENGINE         ║
║                                          ║
║   Old lanes removed. Use the swarm:      ║
║   npm run aro:swarm                      ║
║   npm run aro:swarm -- --dry-run         ║
╚══════════════════════════════════════════╝
`)
  console.log('The Email Swarm is now the sole distribution channel.')
  console.log('Run: npm run aro:swarm -- --help')
}
