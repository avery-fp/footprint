import { createClient } from '@supabase/supabase-js';
import playwright from 'playwright';
import path from 'path';

const URL = 'https://sgoxqxsftuiqvbqszdrn.supabase.co'; 
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnb3hxeHNmdHVpcXZicXN6ZHJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzgzNDk1MCwiZXhwIjoyMDgzNDEwOTUwfQ.kF7suz0ZSNzGUPO11_WnMpgI4xwpo-KCtUZJH6XVRZ8'; 

const supabase = createClient(URL, KEY);

async function run() {
  console.log('[SYSTEM] STATUS: ACTIVE. SCANNING_DB...');
  const { data: seeds } = await supabase.from('aro_seeds').select('*').eq('status', 'pending').limit(1);

  if (!seeds || seeds.length === 0) {
    console.log('[IDLE] NO_SEEDS. POLLING_10S...');
    return setTimeout(run, 10000);
  }

  const seed = seeds[0];
  console.log(`[TARGET] SEED_DETECTED: ${seed.surface_url}`);

  const browser = await playwright.chromium.launchPersistentContext(
    path.join(process.cwd(), 'profiles/reddit/chrome-data'),
    { headless: false }
  );

  const page = await browser.newPage();
  try {
    await page.goto(seed.surface_url);
    await page.waitForTimeout(5000);
    await page.keyboard.press('c'); 
    await page.waitForTimeout(1000);
    await page.keyboard.type(seed.comment_text + " " + Math.random().toString(36).substring(7), { delay: 50 });
    
    await supabase.from('aro_seeds').update({ status: 'posted' }).eq('id', seed.id);
    console.log('[SUCCESS] SEED_PLANTED. SCRIPT WAITING 10S TO CLOSE.');
    await page.waitForTimeout(10000);
  } catch (err) {
    console.error('[ERROR] FAILED');
  } finally {
    await browser.close();
    run(); 
  }
}
run();
