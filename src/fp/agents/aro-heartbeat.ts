const KEY = 'aro-fp-2026';
const HEARTBEAT_URL = 'https://www.footprint.onl/api/aro/reactor/cycle?token=' + KEY;

async function pulse() {
  console.log('[HEARTBEAT] TRIGGERING_CLOUD_BRAIN...');
  try {
    const resp = await fetch(HEARTBEAT_URL);
    const data = await resp.json();
    console.log('[BRAIN_RESPONSE]', JSON.stringify(data.result));
  } catch (e) {
    console.error('[HEARTBEAT_ERROR] BRAIN_NOT_RESPONDING');
  }
  // The Pulse: Wakes up the brain every 2 minutes
  setTimeout(pulse, 120000); 
}

pulse();
