import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface AlertEmailParams {
  to: string
  cardTitle: string
  listedPrice: number
  fairValue: number
  roiPct: number
  listingUrl: string
  watchlistName: string
}

export async function sendAlertEmail(params: AlertEmailParams): Promise<void> {
  const { to, cardTitle, listedPrice, fairValue, roiPct, listingUrl, watchlistName } = params

  await resend.emails.send({
    from: 'CardEdge <alerts@cardedge.app>',
    to,
    subject: `Deal Alert: ${cardTitle} — +${roiPct.toFixed(1)}% below market`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#6366f1;">CardEdge Deal Alert</h2>
        <p><strong>${cardTitle}</strong></p>
        <p style="font-size:1.5rem;color:#059669;font-weight:700;">+${roiPct.toFixed(1)}% below market</p>
        <table>
          <tr><td>Listed:</td><td><strong>$${listedPrice.toFixed(2)}</strong></td></tr>
          <tr><td>Fair Value:</td><td><strong>$${fairValue.toFixed(2)}</strong></td></tr>
          <tr><td>Watchlist:</td><td>${watchlistName}</td></tr>
        </table>
        <a href="${listingUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;">View on eBay</a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">You're receiving this because you have email alerts enabled in CardEdge.</p>
      </div>
    `,
  })
}
