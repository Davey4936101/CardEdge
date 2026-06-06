import { Suspense } from 'react'
import { PortfolioClient } from '@/components/portfolio/PortfolioClient'

export default function PortfolioPage() {
  return (
    <Suspense>
      <PortfolioClient />
    </Suspense>
  )
}
