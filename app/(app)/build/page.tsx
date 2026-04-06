import { redirect } from 'next/navigation'

/**
 * /build is dead. The integrated void transition on the public page
 * IS the claim flow now. Visitors see /ae, click "yours →", dissolve
 * into the field, and claim from there.
 */
export default function BuildPage() {
  redirect('/ae')
}
