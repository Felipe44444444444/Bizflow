'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useCallback, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import {
  ArrowLeft, FileText, Globe, Database, RefreshCw, Trash2,
  AlertCircle, CheckCircle, Clock, Loader2, Zap, X, Plus,
  Eye, EyeOff, Link2, ChevronDown, ChevronRight, Brain,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────────

interface KnowledgeDoc {
  id: string
  title: string
  source_type: string
  source_url: string | null
  supabase_table: string | null
  connection_id: string | null
  status: string
  last_synced_at: string | null
  chunk_count: number
}

interface AgentMeta { id: string; name: string }

interface SupabaseConnection {
  id: string
  project_name: string
  supabase_url: string
  project_ref: string | null
  is_xenttech_auto: boolean
  connected_at: string
}

interface TableInfo {
  name: string
  row_count: number
  columns: { name: string; type: string }[]
}

interface TableState { selected: boolean; filter: string; expanded: boolean }
type SyncStatus = 'pending' | 'syncing' | 'done' | 'error'

interface ConnectResult {
  connection_id: string
  project_name: string
  tables: TableInfo[]
}

// ── Status badge ─────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:    { label: 'En cola',    Icon: Clock,       cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', spin: false },
  processing: { label: 'Procesando',Icon: Loader2,      cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',     spin: true  },
  ready:      { label: 'Listo',     Icon: CheckCircle,  cls: 'bg-[#00E67A]/10 text-[#00E67A] border-[#00E67A]/20', spin: false },
  error:      { label: 'Error',     Icon: AlertCircle,  cls: 'bg-red-500/10 text-red-400 border-red-500/20',       spin: false },
} as const

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending
  const { label, Icon, cls, spin } = cfg
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0', cls)}>
      <Icon className={cn('h-2.5 w-2.5', spin && 'animate-spin')} />
      {label}
    </span>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const ms = Date.now() - new Date(iso).getTime()
  const s  = Math.floor(ms / 1000)
  if (s < 60)  return 'hace un momento'
  const m = Math.floor(s / 60)
  if (m < 60)  return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

// ── Component ────────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const { id: agentId } = useParams<{ id: string }>()

  // Core data
  const [agent,       setAgent]       = useState<AgentMeta | null>(null)
  const [docs,        setDocs]        = useState<KnowledgeDoc[]>([])
  const [connections, setConnections] = useState<SupabaseConnection[]>([])
  const [loading,     setLoading]     = useState(true)
  const [pageError,   setPageError]   = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)

  // Left column panels
  const [showManualPanel, setShowManualPanel] = useState(false)
  const [showUrlPanel,    setShowUrlPanel]    = useState(false)
  const [docTitle,        setDocTitle]        = useState('')
  const [docContent,      setDocContent]      = useState('')
  const [addingDoc,       setAddingDoc]       = useState(false)
  const [scrapeUrl,       setScrapeUrl]       = useState('')
  const [scraping,        setScraping]        = useState(false)

  // 3-step modal (0 = hidden)
  const [modalStep,       setModalStep]       = useState<0 | 1 | 2 | 3>(0)
  const [connectingBrain, setConnectingBrain] = useState(false)
  const [modalError,      setModalError]      = useState<string | null>(null)

  // Step 2 — credentials
  const [projName,  setProjName]  = useState('')
  const [sbUrl,     setSbUrl]     = useState('')
  const [sbKey,     setSbKey]     = useState('')
  const [showSbKey, setShowSbKey] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Step 3 — table selector
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null)
  const [tableSearch,   setTableSearch]   = useState('')
  const [tableStates,   setTableStates]   = useState<Record<string, TableState>>({})
  const [syncing,       setSyncing]       = useState(false)
  const [syncProgress,  setSyncProgress]  = useState<Record<string, SyncStatus>>({})

  // Derived
  const unconnectedDocs = docs.filter(d => !d.connection_id)
  const connectedDocs   = (connId: string) => docs.filter(d => d.connection_id === connId)
  const hasProcessing   = docs.some(d => d.status === 'pending' || d.status === 'processing')
  const totalVectors    = docs.reduce((s, d) => s + (d.chunk_count ?? 0), 0)
  const readyCount      = docs.filter(d => d.status === 'ready').length

  const filteredTables  = (connectResult?.tables ?? []).filter(
    t => !tableSearch || t.name.toLowerCase().includes(tableSearch.toLowerCase())
  )
  const selectedCount   = Object.values(tableStates).filter(s => s.selected).length
  const allSyncDone     = Object.keys(syncProgress).length > 0 &&
    Object.values(syncProgress).every(s => s === 'done' || s === 'error')
  const syncDoneCount   = Object.values(syncProgress).filter(s => s === 'done').length

  // Data loading
  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/knowledge`)
    if (!res.ok) { setPageError('Error al cargar datos'); setLoading(false); return }
    const json = await res.json()
    setAgent(json.agent)
    setDocs(json.docs ?? [])
    setConnections(json.connections ?? [])
    setLoading(false)
  }, [agentId])

  useEffect(() => { loadDocs() }, [loadDocs])

  useEffect(() => {
    if (!hasProcessing) return
    const t = setInterval(loadDocs, 3000)
    return () => clearInterval(t)
  }, [hasProcessing, loadDocs])

  // Helpers
  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  async function apiFetch(url: string, opts: RequestInit) {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
    return json
  }

  // Actions
  async function addDoc() {
    if (!docTitle.trim() || !docContent.trim()) return
    setAddingDoc(true); setPageError(null)
    try {
      await apiFetch(`/api/agents/${agentId}/knowledge`, {
        method: 'POST', body: JSON.stringify({ title: docTitle.trim(), content: docContent.trim() })
      })
      setDocTitle(''); setDocContent(''); setShowManualPanel(false)
      showSuccess('Documento añadido — procesando embeddings...')
      await loadDocs()
    } catch (e) { setPageError((e as Error).message) }
    finally { setAddingDoc(false) }
  }

  async function scrapeURL() {
    if (!scrapeUrl.trim()) return
    setScraping(true); setPageError(null)
    try {
      await apiFetch(`/api/agents/${agentId}/knowledge/scrape`, {
        method: 'POST', body: JSON.stringify({ url: scrapeUrl.trim() })
      })
      setScrapeUrl(''); setShowUrlPanel(false)
      showSuccess('URL importada — procesando contenido...')
      await loadDocs()
    } catch (e) { setPageError((e as Error).message) }
    finally { setScraping(false) }
  }

  async function reprocessDoc(docId: string) {
    setPageError(null)
    try {
      await apiFetch(`/api/agents/${agentId}/knowledge/${docId}`, { method: 'POST' })
      showSuccess('Re-procesando...')
      await loadDocs()
    } catch (e) { setPageError((e as Error).message) }
  }

  async function deleteDoc(docId: string, msg = '¿Eliminar este documento?') {
    if (!confirm(msg)) return
    setPageError(null)
    try {
      await apiFetch(`/api/agents/${agentId}/knowledge/${docId}`, { method: 'DELETE' })
      showSuccess('Documento eliminado')
      await loadDocs()
    } catch (e) { setPageError((e as Error).message) }
  }

  async function disconnectProject(connId: string) {
    if (!confirm('¿Desconectar este proyecto? Se eliminarán todos los documentos sincronizados.')) return
    setPageError(null)
    try {
      await apiFetch(`/api/agents/${agentId}/knowledge/connection/${connId}`, { method: 'DELETE' })
      showSuccess('Proyecto desconectado')
      await loadDocs()
    } catch (e) { setPageError((e as Error).message) }
  }

  // Modal helpers
  function closeModal() {
    setModalStep(0); setModalError(null)
    setProjName(''); setSbUrl(''); setSbKey(''); setShowSbKey(false)
    setVerifying(false); setConnectingBrain(false)
    setConnectResult(null); setTableSearch('')
    setTableStates({}); setSyncing(false); setSyncProgress({})
  }

  function initTables(tables: TableInfo[]) {
    const init: Record<string, TableState> = {}
    for (const t of tables) init[t.name] = { selected: false, filter: '', expanded: false }
    setTableStates(init)
  }

  async function connectBrain() {
    setConnectingBrain(true); setModalError(null)
    try {
      const data = await apiFetch(`/api/agents/${agentId}/knowledge/connect-supabase`, {
        method: 'POST', body: JSON.stringify({ service_role_key: 'XENTTECH_AUTO' })
      })
      setConnectResult(data); initTables(data.tables ?? [])
      setModalStep(3)
    } catch (e) { setModalError((e as Error).message) }
    finally { setConnectingBrain(false) }
  }

  async function verifyConnection() {
    if (!projName.trim() || !sbUrl.trim() || !sbKey.trim()) return
    setVerifying(true); setModalError(null)
    try {
      const data = await apiFetch(`/api/agents/${agentId}/knowledge/connect-supabase`, {
        method: 'POST',
        body: JSON.stringify({ project_name: projName.trim(), supabase_url: sbUrl.trim(), service_role_key: sbKey.trim() })
      })
      setConnectResult(data); initTables(data.tables ?? [])
      setModalStep(3)
    } catch (e) { setModalError((e as Error).message) }
    finally { setVerifying(false) }
  }

  function toggleTable(name: string) {
    setTableStates(p => ({ ...p, [name]: { ...p[name], selected: !p[name].selected } }))
  }
  function toggleExpand(name: string) {
    setTableStates(p => ({ ...p, [name]: { ...p[name], expanded: !p[name].expanded } }))
  }
  function updateFilter(name: string, val: string) {
    setTableStates(p => ({ ...p, [name]: { ...p[name], filter: val } }))
  }
  function selectAll() {
    setTableStates(p => {
      const n = { ...p }
      for (const k of Object.keys(n)) n[k] = { ...n[k], selected: true }
      return n
    })
  }
  function deselectAll() {
    setTableStates(p => {
      const n = { ...p }
      for (const k of Object.keys(n)) n[k] = { ...n[k], selected: false }
      return n
    })
  }

  async function syncSelectedTables() {
    if (!connectResult || selectedCount === 0 || syncing) return
    setSyncing(true)
    const selected = Object.entries(tableStates).filter(([, s]) => s.selected)
    const init: Record<string, SyncStatus> = {}
    for (const [name] of selected) init[name] = 'pending'
    setSyncProgress(init)

    for (const [name, state] of selected) {
      setSyncProgress(p => ({ ...p, [name]: 'syncing' }))
      try {
        let filter: Record<string, unknown> | undefined
        if (state.filter.trim()) {
          try { filter = JSON.parse(state.filter.trim()) } catch { /* ignore bad JSON */ }
        }
        await apiFetch(`/api/agents/${agentId}/knowledge/sync-table`, {
          method: 'POST',
          body: JSON.stringify({ connection_id: connectResult.connection_id, table_name: name, filter })
        })
        setSyncProgress(p => ({ ...p, [name]: 'done' }))
      } catch {
        setSyncProgress(p => ({ ...p, [name]: 'error' }))
      }
    }
    setSyncing(false)
    await loadDocs()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#04040F]">
      <Header title={agent?.name ? `${agent.name} — Conocimiento` : 'Entrenamiento'} description="Gestiona las fuentes de conocimiento del agente" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <Link href="/agency/agents"
              className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Agentes
            </Link>
            <span className="text-[#1A1A35]">/</span>
            <span className="text-sm text-white font-medium flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-[#00D4AA]" />
              {agent?.name ?? '…'} — Conocimiento
            </span>
          </div>

          {/* Banners */}
          {pageError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{pageError}</span>
              <button onClick={() => setPageError(null)}><X className="h-4 w-4" /></button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-[#00E67A]/30 bg-[#00E67A]/[0.07] px-4 py-3 text-sm text-[#00E67A]">
              <CheckCircle className="h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Documentos',    value: loading ? '—' : docs.length,        sub: 'fuentes de conocimiento' },
              { label: 'Vectores',      value: loading ? '—' : totalVectors,       sub: 'chunks indexados' },
              { label: 'Listos',        value: loading ? '—' : readyCount,         sub: 'docs procesados' },
              { label: 'Conexiones DB', value: loading ? '—' : connections.length, sub: 'proyectos vinculados' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-[#1A1A35] bg-[#080812] p-4">
                <p className="text-xs text-[#64748B] mb-1">{s.label}</p>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* 2-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

            {/* ── LEFT ── */}
            <div className="space-y-4">

              {/* Quick-add buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowManualPanel(p => !p); setShowUrlPanel(false) }}
                  className={cn(
                    'flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border font-medium transition-colors',
                    showManualPanel
                      ? 'border-[#00D4AA]/50 bg-[#00D4AA]/10 text-[#00D4AA]'
                      : 'border-[#1A1A35] bg-[#080812] text-[#64748B] hover:text-white hover:border-[#2A2A45]'
                  )}>
                  <FileText className="h-3.5 w-3.5" /> Texto manual
                </button>
                <button
                  onClick={() => { setShowUrlPanel(p => !p); setShowManualPanel(false) }}
                  className={cn(
                    'flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border font-medium transition-colors',
                    showUrlPanel
                      ? 'border-[#00D4AA]/50 bg-[#00D4AA]/10 text-[#00D4AA]'
                      : 'border-[#1A1A35] bg-[#080812] text-[#64748B] hover:text-white hover:border-[#2A2A45]'
                  )}>
                  <Globe className="h-3.5 w-3.5" /> Importar URL
                </button>
              </div>

              {/* Manual text panel */}
              {showManualPanel && (
                <div className="rounded-xl border border-[#1A1A35] bg-[#080812] p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Añadir documento</p>
                  <input
                    placeholder="Título del documento"
                    value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    className="w-full rounded-lg bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50"
                  />
                  <textarea
                    rows={5}
                    placeholder="Pega aquí el contenido que el agente debe conocer..."
                    value={docContent}
                    onChange={e => setDocContent(e.target.value)}
                    className="w-full rounded-lg bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50 resize-none"
                  />
                  <Button
                    onClick={addDoc}
                    disabled={addingDoc || !docTitle.trim() || !docContent.trim()}
                    className="bg-[#00D4AA] text-black font-bold h-9 text-sm px-4 disabled:opacity-40">
                    {addingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                  </Button>
                </div>
              )}

              {/* URL panel */}
              {showUrlPanel && (
                <div className="rounded-xl border border-[#1A1A35] bg-[#080812] p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Importar URL</p>
                  <input
                    type="url"
                    placeholder="https://ejemplo.com/pagina"
                    value={scrapeUrl}
                    onChange={e => setScrapeUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && scrapeURL()}
                    className="w-full rounded-lg bg-[#0D0D1F] border border-[#1A1A35] px-3 py-2 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50"
                  />
                  <Button
                    onClick={scrapeURL}
                    disabled={scraping || !scrapeUrl.trim()}
                    className="bg-[#00D4AA] text-black font-bold h-9 text-sm px-4 disabled:opacity-40">
                    {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Importar'}
                  </Button>
                </div>
              )}

              {/* Connected databases */}
              <div className="rounded-xl border border-[#1A1A35] overflow-hidden">
                <div className="bg-[#080812] px-4 py-3 border-b border-[#1A1A35] flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-[#00D4AA]" />
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Bases de datos</p>
                  {connections.length > 0 && (
                    <span className="ml-auto text-xs text-[#64748B]">
                      {connections.length} conectada{connections.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {connections.map(conn => {
                    const cDocs = connectedDocs(conn.id)
                    return (
                      <div key={conn.id} className="rounded-xl border border-[#1A1A35] bg-[#0D0D1F] overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1A1A35]">
                          <div className={cn('w-2 h-2 rounded-full shrink-0', conn.is_xenttech_auto ? 'bg-[#00D4AA]' : 'bg-purple-400')} />
                          <span className="text-sm font-semibold text-white flex-1 truncate">{conn.project_name}</span>
                          {conn.is_xenttech_auto && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#00D4AA]/30 bg-[#00D4AA]/10 text-[#00D4AA] shrink-0">AUTO</span>
                          )}
                          <button onClick={() => disconnectProject(conn.id)} title="Desconectar"
                            className="text-[#3A3A5C] hover:text-red-400 transition-colors ml-1 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="px-3 py-1.5 border-b border-[#1A1A35]">
                          <p className="text-xs text-[#3A3A5C] truncate">
                            {conn.supabase_url.replace('https://', '')} · {timeAgo(conn.connected_at)}
                          </p>
                        </div>

                        <div className="px-3 py-2 space-y-1">
                          {cDocs.length === 0 && (
                            <p className="text-xs text-[#3A3A5C] italic py-1">Sin tablas sincronizadas</p>
                          )}
                          {cDocs.map(doc => (
                            <div key={doc.id} className="flex items-center gap-2 py-1">
                              <span className="text-xs text-[#64748B] flex-1 truncate">{doc.supabase_table}</span>
                              <StatusBadge status={doc.status} />
                              <button onClick={() => reprocessDoc(doc.id)} title="Re-sincronizar"
                                className="text-[#3A3A5C] hover:text-[#00D4AA] transition-colors p-0.5">
                                <RefreshCw className="h-3 w-3" />
                              </button>
                              <button onClick={() => deleteDoc(doc.id, `¿Eliminar "${doc.supabase_table}"?`)} title="Eliminar"
                                className="text-[#3A3A5C] hover:text-red-400 transition-colors p-0.5">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => setModalStep(1)}
                            className="text-xs text-[#00D4AA] hover:text-[#00E67A] transition-colors mt-1 block">
                            + Agregar tablas
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {connections.length === 0 && (
                    <div className="text-center py-4">
                      <Database className="h-8 w-8 text-[#1A1A35] mx-auto mb-2" />
                      <p className="text-xs text-[#64748B]">Sin conexiones</p>
                      <p className="text-[11px] text-[#3A3A5C] mt-0.5">Conecta la base de datos del cliente para que el agente conozca sus datos</p>
                    </div>
                  )}

                  <button
                    onClick={() => setModalStep(1)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#00D4AA]/30 bg-[#00D4AA]/[0.04] hover:bg-[#00D4AA]/10 text-[#00D4AA] font-semibold py-2.5 text-sm transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Conectar Supabase
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT — docs status ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  Documentos{unconnectedDocs.length > 0 ? ` (${unconnectedDocs.length})` : ''}
                </p>
                {hasProcessing && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Actualizando...
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-[#00D4AA] animate-spin" />
                </div>
              ) : unconnectedDocs.length === 0 ? (
                <div className="rounded-xl border border-[#1A1A35] bg-[#080812] p-8 text-center">
                  <FileText className="h-8 w-8 text-[#1A1A35] mx-auto mb-2" />
                  <p className="text-sm text-[#64748B]">Sin documentos</p>
                  <p className="text-xs text-[#3A3A5C] mt-1">Añade texto, importa una URL o conecta una base de datos</p>
                </div>
              ) : (
                <div className="rounded-xl border border-[#1A1A35] bg-[#080812] divide-y divide-[#1A1A35] overflow-hidden">
                  {unconnectedDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                      {doc.source_type === 'url' || doc.source_type === 'web'
                        ? <Globe className="h-4 w-4 text-[#3A3A5C] shrink-0" />
                        : <FileText className="h-4 w-4 text-[#3A3A5C] shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{doc.title}</p>
                        <p className="text-xs text-[#3A3A5C] mt-0.5">
                          {doc.chunk_count} chunks · {timeAgo(doc.last_synced_at)}
                        </p>
                      </div>
                      <StatusBadge status={doc.status} />
                      <button onClick={() => reprocessDoc(doc.id)} title="Re-procesar"
                        className="text-[#3A3A5C] hover:text-[#00D4AA] transition-colors p-1">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteDoc(doc.id)} title="Eliminar"
                        className="text-[#3A3A5C] hover:text-red-400 transition-colors p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── 3-step modal ─────────────────────────────────────────────────── */}
      {modalStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0D0D1F] border border-[#1A1A35] rounded-2xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A35] shrink-0">
              <h3 className="font-bold text-white">
                {modalStep === 1 && 'Conectar base de datos Supabase'}
                {modalStep === 2 && 'Credenciales del proyecto'}
                {modalStep === 3 && `Tablas — ${connectResult?.project_name}`}
              </h3>
              <button onClick={closeModal} className="text-[#64748B] hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error banner */}
            {modalError && (
              <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400 shrink-0">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Step 1 — choose type */}
            {modalStep === 1 && (
              <div className="p-6">
                <p className="text-sm text-[#64748B] mb-5">Elige el tipo de base de datos que quieres conectar:</p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={connectBrain}
                    disabled={connectingBrain}
                    className="flex flex-col items-start gap-3 rounded-2xl border border-[#00D4AA]/30 bg-[#00D4AA]/[0.03] hover:bg-[#00D4AA]/[0.07] hover:border-[#00D4AA]/50 p-5 text-left transition-all disabled:opacity-60">
                    <div className="w-10 h-10 rounded-xl bg-[#00D4AA]/10 flex items-center justify-center">
                      {connectingBrain
                        ? <Loader2 className="h-5 w-5 text-[#00D4AA] animate-spin" />
                        : <Zap className="h-5 w-5 text-[#00D4AA]" />
                      }
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">⚡ XENTTECH Brain</p>
                      <p className="text-xs text-[#64748B] mt-1 leading-relaxed">Supabase principal de XENTTECH. Configurado automáticamente.</p>
                    </div>
                    {!connectingBrain && <span className="text-xs text-[#00D4AA]">Conectar →</span>}
                  </button>

                  <button
                    onClick={() => { setModalError(null); setModalStep(2) }}
                    className="flex flex-col items-start gap-3 rounded-2xl border border-[#1A1A35] hover:border-purple-400/40 hover:bg-purple-400/[0.03] p-5 text-left transition-all">
                    <div className="w-10 h-10 rounded-xl bg-[#1A1A35] flex items-center justify-center">
                      <Link2 className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">🔗 Otro proyecto</p>
                      <p className="text-xs text-[#64748B] mt-1 leading-relaxed">Supabase del cliente. Ingresa URL y Service Role Key.</p>
                    </div>
                    <span className="text-xs text-purple-400">Configurar →</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — credentials */}
            {modalStep === 2 && (
              <div className="p-6 space-y-4">
                <p className="text-xs text-[#64748B]">Ingresa las credenciales del proyecto Supabase del cliente:</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#64748B] mb-1.5 block">Nombre del proyecto</label>
                    <input
                      placeholder="Mi Cliente — Tienda Online"
                      value={projName}
                      onChange={e => setProjName(e.target.value)}
                      className="w-full rounded-xl bg-[#080812] border border-[#1A1A35] px-3 py-2.5 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1.5 block">URL del proyecto</label>
                    <input
                      placeholder="https://xxxx.supabase.co"
                      value={sbUrl}
                      onChange={e => setSbUrl(e.target.value)}
                      className="w-full rounded-xl bg-[#080812] border border-[#1A1A35] px-3 py-2.5 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#64748B] mb-1.5 block">Service Role Key</label>
                    <div className="relative">
                      <input
                        type={showSbKey ? 'text' : 'password'}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp..."
                        value={sbKey}
                        onChange={e => setSbKey(e.target.value)}
                        className="w-full rounded-xl bg-[#080812] border border-[#1A1A35] px-3 py-2.5 pr-10 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50 transition-colors"
                      />
                      <button onClick={() => setShowSbKey(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3A3A5C] hover:text-[#64748B] transition-colors">
                        {showSbKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#3A3A5C] mt-1.5">
                      🔒 Cifrada con AES-256-GCM. Nunca se almacena en texto plano.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button onClick={() => { setModalError(null); setModalStep(1) }}
                    className="text-sm text-[#64748B] hover:text-white transition-colors">
                    ← Atrás
                  </button>
                  <Button
                    onClick={verifyConnection}
                    disabled={!projName.trim() || !sbUrl.trim() || !sbKey.trim() || verifying}
                    className="bg-[#00D4AA] text-black font-bold h-9 text-sm px-5 disabled:opacity-40 gap-2">
                    {verifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {verifying ? 'Verificando...' : 'Verificar conexión →'}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3 — table selector */}
            {modalStep === 3 && connectResult && (
              <>
                <div className="px-6 py-3 border-b border-[#1A1A35] space-y-2 shrink-0">
                  <input
                    placeholder="Buscar tabla..."
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                    className="w-full rounded-xl bg-[#080812] border border-[#1A1A35] px-3 py-2 text-sm text-white placeholder-[#3A3A5C] focus:outline-none focus:border-[#00D4AA]/50 transition-colors"
                  />
                  <div className="flex gap-4">
                    <button onClick={selectAll} disabled={syncing}
                      className="text-xs text-[#00D4AA] hover:text-[#00E67A] transition-colors disabled:opacity-40">
                      Seleccionar todo
                    </button>
                    <button onClick={deselectAll} disabled={syncing}
                      className="text-xs text-[#64748B] hover:text-white transition-colors disabled:opacity-40">
                      Deseleccionar
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-0">
                  {filteredTables.length === 0 && (
                    <p className="text-sm text-[#64748B] text-center py-6">No se encontraron tablas</p>
                  )}
                  {filteredTables.map(t => {
                    const ts = tableStates[t.name]
                    const sp = syncProgress[t.name]
                    return (
                      <div key={t.name} className={cn(
                        'rounded-xl border transition-colors overflow-hidden',
                        ts?.selected ? 'border-[#00D4AA]/30 bg-[#00D4AA]/[0.03]' : 'border-[#1A1A35]'
                      )}>
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <button
                            onClick={() => !syncing && toggleTable(t.name)}
                            disabled={syncing}
                            className={cn(
                              'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              ts?.selected ? 'border-[#00D4AA] bg-[#00D4AA]' : 'border-[#3A3A5C] bg-transparent'
                            )}>
                            {ts?.selected && <span className="text-black text-[9px] font-bold leading-none">✓</span>}
                          </button>
                          <span className="font-mono text-sm text-white flex-1 truncate">{t.name}</span>
                          <span className="text-xs text-[#3A3A5C] shrink-0">{t.row_count.toLocaleString()} filas</span>
                          {sp === 'pending' && <span className="text-[10px] text-[#64748B] px-1.5 py-0.5 rounded border border-[#1A1A35]">En cola</span>}
                          {sp === 'syncing' && (
                            <span className="flex items-center gap-1 text-[10px] text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sincronizando
                            </span>
                          )}
                          {sp === 'done'  && <span className="text-[10px] text-[#00E67A] px-1.5 py-0.5 rounded border border-[#00E67A]/20 bg-[#00E67A]/10">✓ Listo</span>}
                          {sp === 'error' && <span className="text-[10px] text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/10">✗ Error</span>}
                          {t.columns.length > 0 && (
                            <button onClick={() => toggleExpand(t.name)}
                              className="text-[#3A3A5C] hover:text-[#64748B] transition-colors shrink-0">
                              {ts?.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>

                        {ts?.expanded && t.columns.length > 0 && (
                          <div className="px-4 pb-2 pt-0.5 border-t border-[#1A1A35]">
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {t.columns.map(col => (
                                <span key={col.name} className="text-[10px] px-2 py-0.5 rounded-full bg-[#1A1A35] text-[#64748B]">
                                  {col.name} <span className="text-[#3A3A5C]">{col.type}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {ts?.selected && !syncing && (
                          <div className="px-4 pb-3 pt-1 border-t border-[#1A1A35]/50">
                            <input
                              placeholder='Filtro JSON opcional ej: {"status": "active"}'
                              value={ts.filter}
                              onChange={e => updateFilter(t.name, e.target.value)}
                              className="w-full rounded-lg bg-[#080812] border border-[#1A1A35] px-2.5 py-1.5 text-xs text-white placeholder-[#3A3A5C] font-mono focus:outline-none focus:border-[#00D4AA]/30 transition-colors"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="px-6 py-4 border-t border-[#1A1A35] flex items-center justify-between shrink-0">
                  {allSyncDone ? (
                    <>
                      <span className="text-sm text-[#00E67A]">
                        ✅ {syncDoneCount} tabla{syncDoneCount !== 1 ? 's' : ''} sincronizada{syncDoneCount !== 1 ? 's' : ''}. El agente está listo.
                      </span>
                      <Button onClick={closeModal} className="bg-[#00D4AA] text-black font-bold h-9 text-sm px-5">
                        Cerrar
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-[#64748B]">
                        {syncing
                          ? `Sincronizando... (${Object.values(syncProgress).filter(s => s === 'done').length}/${Object.keys(syncProgress).length})`
                          : `${selectedCount} tabla${selectedCount !== 1 ? 's' : ''} seleccionada${selectedCount !== 1 ? 's' : ''}`
                        }
                      </span>
                      <div className="flex items-center gap-3">
                        {!syncing && (
                          <button onClick={() => { setModalError(null); setModalStep(1) }}
                            className="text-sm text-[#64748B] hover:text-white transition-colors">
                            ← Atrás
                          </button>
                        )}
                        <Button
                          onClick={syncSelectedTables}
                          disabled={selectedCount === 0 || syncing}
                          className="bg-[#00D4AA] text-black font-bold h-9 text-sm px-5 gap-2 disabled:opacity-40">
                          {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {syncing
                            ? 'Sincronizando...'
                            : `Sincronizar ${selectedCount > 0 ? selectedCount : ''} tabla${selectedCount !== 1 ? 's' : ''} →`
                          }
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
