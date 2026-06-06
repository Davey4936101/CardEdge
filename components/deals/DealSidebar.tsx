'use client'

import { X } from 'lucide-react'
import { DEFAULT_FILTERS, type FilterState } from '@/lib/deals/deal-score'

interface DealSidebarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-700/70 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors'

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label
      className="flex items-center gap-2.5 cursor-pointer group select-none"
      onClick={() => onChange(!checked)}
    >
      <div
        role="checkbox"
        aria-checked={checked}
        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors pointer-events-none ${
          checked
            ? 'bg-indigo-600 border-indigo-600'
            : 'bg-slate-800 border-slate-600 group-hover:border-slate-500'
        }`}
      >
        {checked && (
          <svg className="size-2.5 text-white" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-sm text-slate-300 group-hover:text-slate-200">{children}</span>
    </label>
  )
}

export function DealSidebar({ filters, onChange }: DealSidebarProps) {
  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value })
  }

  const hasActiveFilters =
    filters.player !== DEFAULT_FILTERS.player ||
    filters.gradedOnly !== DEFAULT_FILTERS.gradedOnly ||
    filters.rookieOnly !== DEFAULT_FILTERS.rookieOnly ||
    filters.minPrice !== DEFAULT_FILTERS.minPrice ||
    filters.maxPrice !== DEFAULT_FILTERS.maxPrice ||
    filters.minRoi !== DEFAULT_FILTERS.minRoi

  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col gap-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 h-fit sticky top-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Filters</span>
        {hasActiveFilters && (
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="size-3" /> Clear
          </button>
        )}
      </div>

      {/* Player */}
      <div>
        <Label>Player</Label>
        <input
          className={inputCls}
          placeholder="Any player…"
          value={filters.player}
          onChange={(e) => set('player', e.target.value)}
        />
      </div>

      {/* Price range */}
      <div>
        <Label>Price Range</Label>
        <div className="flex items-center gap-1.5">
          <input
            className={inputCls}
            placeholder="$0"
            type="number"
            min="0"
            value={filters.minPrice}
            onChange={(e) => set('minPrice', e.target.value)}
          />
          <span className="text-slate-600 text-xs flex-shrink-0">–</span>
          <input
            className={inputCls}
            placeholder="Max"
            type="number"
            min="0"
            value={filters.maxPrice}
            onChange={(e) => set('maxPrice', e.target.value)}
          />
        </div>
      </div>

      {/* Min ROI */}
      <div>
        <Label>Min ROI %</Label>
        <input
          className={inputCls}
          type="number"
          min="0"
          max="100"
          value={filters.minRoi}
          onChange={(e) => set('minRoi', e.target.value)}
        />
      </div>

      {/* Card type */}
      <div className="flex flex-col gap-2.5">
        <Label>Card Type</Label>
        <CheckboxRow
          checked={filters.rookieOnly}
          onChange={(v) => set('rookieOnly', v)}
        >
          Rookie cards only
        </CheckboxRow>
        <CheckboxRow
          checked={filters.gradedOnly}
          onChange={(v) => set('gradedOnly', v)}
        >
          Graded only
        </CheckboxRow>
      </div>
    </aside>
  )
}
