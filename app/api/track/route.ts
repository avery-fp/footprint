import { NextRequest, NextResponse } from 'next/server'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export async function GET(request: NextRequest) {
  const cluster = request.nextUrl.searchParams.get('cluster') || 'unknown'
  const source = request.nextUrl.searchParams.get('source') || 'unknown'
  const country = request.headers.get('cf-ipcountry')
    || request.headers.get('x-vercel-ip-country')
    || 'unknown'

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    cluster,
    source,
    ip_country: country,
  })

  try {
    const logDir = join(process.cwd(), 'output', 'logs')
    mkdirSync(logDir, { recursive: true })
    appendFileSync(join(logDir, 'clicks.jsonl'), entry + '\n')
  } catch {
    // Don't block redirect on log failure
  }

  return NextResponse.redirect('https://www.footprint.onl', 302)
}
