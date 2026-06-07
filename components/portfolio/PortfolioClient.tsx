'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { PortfolioKpiBar } from './PortfolioKpiBar'
import { PositionsTable } from './PositionsTable'
import { DetailPanel } from './DetailPanel'
import { AddCardModal, type AddCardPrefill } from './AddCardModal'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

const STATUS_PILLS = [
  { key: 'all', label: 'ALL' },
  { key: 'raw_owned', label: 'RAW' },
  { key: 'submitted', label: 'SUB' },
  { key: 'graded_owned', label: 'GRADED' },
  { key: 'sold', label: 'SOLD' },
]

export function PortfolioClient() {
  const [cards, setCards] = useState<PortfolioCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState<AddCardPrefill | undefined>()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const searchParams = useSearchParams()
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await fetchWithAuth('/api/portfolio')
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

  const filteredCards = cards.filter(c => {
    const matchesSearch = !search ||
      c.player.toLowerCase().includes(search.toLowerCase()) ||
      c.set_name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const selectedCard = filteredCards.find((c) => c.id === selectedId) ?? null

  function handleUpdate(updated: PortfolioCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function handleDelete(id: string) {
    await fetchWithAuth(`/api/portfolio/${id}`, { method: 'DELETE' })
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="flex flex-col bg-slate-950" style={{ height: 'calc(100dvh - 64px)' }}>
      <PortfolioKpiBar
        onAdd={() => { setPrefill(undefined); setModalOpen(true) }}
        onRefresh={() => void load()}
        cards={cards}
      />

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
        <input
          type="text"
          placeholder="Search player or set…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none"
        />
        <div className="flex items-center gap-1.5">
          {STATUS_PILLS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                statusFilter === key
                  ? 'bg-amber-400/20 text-amber-400 border-amber-400/40'
                  : 'text-slate-500 border-slate-700 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`overflow-y-auto ${selectedCard ? 'flex-1' : 'w-full'}`}>
          <PositionsTable
            cards={filteredCards}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
            onAdd={() => { setPrefill(undefined); setModalOpen(true) }}
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
