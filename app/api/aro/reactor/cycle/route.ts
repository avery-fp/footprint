import { NextResponse } from 'next/server';
import { runEngine } from '@/src/fp/wave/engine';

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  // Vault Check
  if (token !== process.env.ARO_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // FORCE START: We ignore the is_active database check here.
    // If Avery hits this URL, the machine MUST breathe.
    const result = await runEngine(true); 
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
