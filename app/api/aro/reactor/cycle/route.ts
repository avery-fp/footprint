import { NextResponse } from 'next/server';
import { runEngine } from '@/src/fp/wave/engine';

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (token !== process.env.ARO_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runEngine();
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
