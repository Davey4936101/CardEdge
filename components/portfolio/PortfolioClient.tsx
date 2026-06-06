'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { PortfolioKpiBar } from './PortfolioKpiBar'
import { PositionsTable } from './PositionsTable'
import { DetailPanel } from './DetailPanel'
import { AddCardModal, type AddCardPrefill } from './AddCardModal'

export function PortfolioClient() {
  const [cards, setCards] = useState<PortfolioCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState<AddCardPrefill | undefined>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await fetch('/api/portfolio')
    const data = (await res.json()) as PortfolioCard[]
    setCards(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { void load() }, [load])

  // Deep-link prefill from /deals or /grade
  useEffect(() => {
    const addFrom = searchParams.get('addFrom')
    if (!addFrom) return
    if (addFrom === 'alert') {
      setPrefill({
        source: 'alert',
        alertId: searchParams.get('alertId') ?? undefined,
        player: searchParams.get('player') ?? undefined,
        setName: searchParams.get('set') ?? undefined,
        grade: searchParams.get('grade') ?? undefined,
        price: searchParams.get('price') ? parseFloat(searchParams.get('price')!) : undefined,
      })
    } else if (addFrom === 'analysis') {
      setPrefill({
        source: 'analysis',
        analysisId: searchParams.get('analysisId') ?? undefined,
        player: searchParams.get('player') ?? undefined,
        setName: searchParams.get('set') ?? undefined,
        grade: null,
      })
    }
    setModalOpen(true)
    router.replace('/portfolio')
  }, [searchParams, router])

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null

  function handleUpdate(updated: PortfolioCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/portfolio/${id}`, { method: 'DELETE' })
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="flex flex-col bg-slate-950" style={{ height: 'calc(100dvh - 56px)' }}>
      <PortfolioKpiBar onAdd={() => { setPrefill(undefined); setModalOpen(true) }} />
      <div className="flex flex-1 overflow-hidden">
        <div className={`overflow-y-auto ${selectedCard ? 'flex-1' : 'w-full'}`}>
          <PositionsTable
            cards={cards}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
          />
        </div>
        {selectedCard && (
          <div className="w-80 flex-shrink-0 overflow-y-auto">
            <DetailPanel
              card={selectedCard}
              onUpdate={handleUpdate}
              onDelete={(id) => void handleDelete(id)}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
      <AddCardModal
        open={modalOpen}
        prefill={prefill}
        onClose={() => { setModalOpen(false); setPrefill(undefined) }}
        onAdd={() => void load()}
      />
    </div>
  )
}
