import { redirect } from 'next/navigation'

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  return redirect(`/${params.slug}`)
}
