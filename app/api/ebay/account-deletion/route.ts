import { createHash } from 'crypto'
import { NextResponse } from 'next/server'

// eBay Marketplace Account Deletion notification endpoint.
// Required by eBay developer policy for all production keysets.
// Docs: https://developer.ebay.com/marketplace-account-deletion

// GET — eBay sends this to verify the endpoint before activating notifications.
// Must respond with SHA-256(challengeCode + verificationToken + endpointUrl).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const challengeCode = searchParams.get('challenge_code')
  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  const verificationToken = process.env.EBAY_DELETION_VERIFICATION_TOKEN
  const endpointUrl = process.env.EBAY_DELETION_ENDPOINT_URL
  if (!verificationToken || !endpointUrl) {
    console.error('[eBay account-deletion] EBAY_DELETION_VERIFICATION_TOKEN or EBAY_DELETION_ENDPOINT_URL not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const challengeResponse = createHash('sha256')
    .update(challengeCode + verificationToken + endpointUrl)
    .digest('hex')

  return NextResponse.json({ challengeResponse })
}

// POST — eBay sends this when an eBay marketplace user deletes their account.
// CardEdge uses only application-level eBay credentials (Browse + Finding APIs)
// in read-only mode and stores no eBay user account data, so there is nothing
// to delete. We acknowledge every notification immediately.
export async function POST(req: Request) {
  try {
    await req.json()
  } catch {
    // malformed body — still acknowledge
  }
  return new NextResponse(null, { status: 200 })
}
