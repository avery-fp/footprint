import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function GET(request: NextRequest) {
  const path = new URL(request.url).searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }
  revalidatePath(path)
  return NextResponse.json({ revalidated: true })
}
