"use client"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatusFilter = 'all' | 'ready' | 'generating' | 'published' | 'failed'

interface Props {
  status: StatusFilter
  agentId: string
  search: string
  agents: { id: string; name: string }[]
  counts: Record<StatusFilter, number>
  onStatus: (s: StatusFilter) => void
  onAgent: (id: string) => void
  onSearch: (q: string) => void
}

const TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',        label: 'Todos'      },
  { value: 'ready',      label: 'Listos'     },
  { value: 'generating', label: 'Generando'  },
  { value: 'published',  label: 'Publicados' },
  { value: 'failed',     label: 'Fallidos'   },
]

export function ClipFilters({ status, agentId, search, agents, counts, onStatus, onAgent, onSearch }: Props) {
  return (
    <div className="space-y-3">
      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => onStatus(t.value)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              status === t.value
                ? 'bg-[#00D4AA]/10 text-[#00D4AA] border border-[#00D4AA]/20'
                : 'text-[#64748B] hover:text-white border border-transparent'
            )}
          >
            {t.label}
            {counts[t.value] > 0 && (
              <span className="ml-1.5 text-[10px] opacity-60">{counts[t.value]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search + agent filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#3A3A5C]" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Buscar por tema…"
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40 placeholder-[#3A3A5C]"
          />
        </div>
        {agents.length > 0 && (
          <select
            value={agentId}
            onChange={e => onAgent(e.target.value)}
            className="h-8 px-2 rounded-lg bg-[#080812] border border-[#1A1A35] text-white text-xs focus:outline-none focus:border-[#00D4AA]/40"
          >
            <option value="">Todos los agentes</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
