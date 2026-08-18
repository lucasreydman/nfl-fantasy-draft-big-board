import type { PosFilter } from '../types'
import { POS_FILTERS, filterColor } from '../lib/format'

interface Props {
  value: PosFilter
  onChange: (p: PosFilter) => void
  /** Positional mode already splits by position, so only ALL means anything there. */
  onlyAll?: boolean
}

export function PosTabs({ value, onChange, onlyAll = false }: Props) {
  return (
    <div className="pos-tabs">
      {POS_FILTERS.map((p) => (
        <button
          key={p}
          className={value === p ? 'on' : ''}
          style={{ ['--pos-color' as string]: filterColor(p) }}
          onClick={() => onChange(p)}
          disabled={onlyAll && p !== 'ALL'}
          title={p === 'FLEX' ? 'Every flex-eligible player — RB, WR and TE' : undefined}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
