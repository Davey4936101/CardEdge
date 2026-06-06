'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PortfolioSource } from '@/lib/portfolio/types'

export interface AddCardPrefill {
  player?: string
  setName?: string
  year?: string
  grade?: string | null
  price?: number
  source: PortfolioSource
  alertId?: string
  analysisId?: string
}

interface Props {
  open: boolean
  prefill?: AddCardPrefill
  onClose: () => void
  onAdd: () => void
}

const inputCls =
  'w-full bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-400'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  )
}

export function AddCardModal({ open, prefill, onClose, onAdd }: Props) {
  const [isGraded, setIsGraded] = useState(false)
  const [player, setPlayer] = useState('')
  const [setName, setSetName] = useState('')
  const [year, setYear] = useState('')
  const [grade, setGrade] = useState('10')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlayer(prefill?.player ?? '')
    setSetName(prefill?.setName ?? '')
    setYear(prefill?.year ?? '')
    setPrice(prefill?.price?.toString() ?? '')
    setNotes('')
    setDate(new Date().toISOString().slice(0, 10))
    if (prefill?.grade && !['raw', 'RAW', 'Any', null, undefined].includes(prefill.grade)) {
      setIsGraded(true)
      setGrade(prefill.grade.replace(/[^0-9]/g, '') || '10')
    } else {
      setIsGraded(false)
      setGrade('10')
    }
  }, [open, prefill])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: player.trim(),
        set_name: setName.trim(),
        year: year.trim() || null,
        grade: isGraded ? `PSA ${grade}` : null,
        raw_purchase_price: parseFloat(price),
        raw_purchase_date: date,
        notes: notes.trim() || null,
        source: prefill?.source ?? 'manual',
        alert_id: prefill?.alertId ?? null,
        analysis_id: prefill?.analysisId ?? null,
      }),
    })
    setSubmitting(false)
    onAdd()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-mono font-semibold text-slate-100 uppercase tracking-wider">
            ADD POSITION
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="flex gap-2">
            {(['RAW', 'GRADED'] as const).map((label) => {
              const active = label === 'GRADED' ? isGraded : !isGraded
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setIsGraded(label === 'GRADED')}
                  className={`flex-1 text-[11px] font-mono py-1.5 rounded border transition-colors ${
                    active
                      ? 'bg-amber-400 text-slate-950 border-amber-400'
                      : 'text-slate-400 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <Field label="Player" required>
            <input type="text" value={player} onChange={(e) => setPlayer(e.target.value)} required className={inputCls} placeholder="e.g. Patrick Mahomes" />
          </Field>
          <Field label="Set" required>
            <input type="text" value={setName} onChange={(e) => setSetName(e.target.value)} required className={inputCls} placeholder="e.g. 2018 Panini Prizm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <input type="text" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} placeholder="e.g. 2018" />
            </Field>
            {isGraded && (
              <Field label="PSA Grade" required>
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls}>
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => (
                    <option key={g} value={g}>PSA {g}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Price ($)" required>
              <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Purchase Date" required>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Optional…" />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full text-[12px] font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 py-2.5 rounded transition-colors"
          >
            {submitting ? 'ADDING…' : 'ADD POSITION'}
          </button>
        </form>
      </div>
    </div>
  )
}
