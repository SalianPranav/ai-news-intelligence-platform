import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Newspaper, Search, RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronLeft, ChevronRight, ExternalLink, X, Zap, BarChart2,
  Layers, AlertCircle, CheckCircle, Clock, Filter, Tag
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import {
  fetchArticles, fetchArticle, fetchStats, fetchCategories,
  runPipeline, pipelineStatus
} from './api.js'

// ─── Sentiment config ─────────────────────────────────────────────────────────
const SENTIMENT = {
  positive: { color: '#22c55e', bg: 'bg-green-500/15', text: 'text-green-400', icon: TrendingUp,  label: 'Positive' },
  negative: { color: '#ef4444', bg: 'bg-red-500/15',   text: 'text-red-400',   icon: TrendingDown, label: 'Negative' },
  neutral:  { color: '#94a3b8', bg: 'bg-slate-500/15', text: 'text-slate-400', icon: Minus,        label: 'Neutral'  },
}

const PIE_COLORS = ['#22c55e', '#ef4444', '#94a3b8']

// ─── Small helpers ────────────────────────────────────────────────────────────
function SentimentBadge({ sentiment }) {
  const cfg = SENTIMENT[sentiment] ?? SENTIMENT.neutral
  const Icon = cfg.icon
  return (
    <span className={`badge ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  )
}

function CategoryBadge({ category }) {
  return (
    <span className="badge bg-indigo-500/15 text-indigo-300">
      {category}
    </span>
  )
}

function ScoreBar({ score }) {
  const pct = ((score + 1) / 2) * 100
  const color = score > 0.15 ? '#22c55e' : score < -0.15 ? '#ef4444' : '#94a3b8'
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="w-12 shrink-0">Score</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right" style={{ color }}>{score.toFixed(2)}</span>
    </div>
  )
}

// ─── Pipeline control bar ─────────────────────────────────────────────────────
function PipelineBar({ onDone }) {
  const [count, setCount]   = useState(100)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const esRef = useRef(null)

  const start = async () => {
    setLoading(true)
    try {
      await runPipeline(count)
      // Connect to SSE for live progress
      esRef.current = new EventSource('/api/pipeline/stream')
      esRef.current.onmessage = (e) => {
        const s = JSON.parse(e.data)
        setStatus(s)
        if (!s.running) {
          esRef.current?.close()
          setLoading(false)
          onDone()
        }
      }
    } catch (err) {
      setLoading(false)
      const msg = err.response?.data?.detail ?? 'Failed to start pipeline.'
      setStatus({ running: false, stage: 'error', message: msg })
    }
  }

  const pct = status?.total
    ? Math.round((status.processed / status.total) * 100)
    : 0

  const stageColor = {
    idle: 'text-slate-400', starting: 'text-indigo-400', fetching: 'text-blue-400',
    storing: 'text-purple-400', analysing: 'text-yellow-400', done: 'text-green-400',
    error: 'text-red-400',
  }[status?.stage ?? 'idle'] ?? 'text-slate-400'

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-yellow-400" />
          <span className="font-semibold text-sm">AI Pipeline</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Articles:</span>
            <select
              value={count}
              onChange={e => setCount(+e.target.value)}
              disabled={loading}
              className="input w-28 py-1.5"
            >
              {[50, 100, 200, 300, 500].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <button onClick={start} disabled={loading} className="btn-primary">
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
              : <><Zap size={14} /> Run Pipeline</>
            }
          </button>
        </div>
      </div>

      {status && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="flex justify-between text-xs">
            <span className={`font-medium ${stageColor}`}>{status.message}</span>
            {loading && <span className="text-slate-400">{pct}%</span>}
          </div>
          {loading && (
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Stats cards ──────────────────────────────────────────────────────────────
function StatsPanel({ stats }) {
  if (!stats) return null
  const { sentiment_distribution: sd = {} } = stats
  const total = stats.processed_articles || 1

  const cards = [
    {
      label: 'Total Articles',
      value: stats.total_articles,
      icon: Newspaper,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
    {
      label: 'AI Processed',
      value: stats.processed_articles,
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Positive',
      value: sd.positive ?? 0,
      icon: TrendingUp,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      pct: Math.round(((sd.positive ?? 0) / total) * 100),
    },
    {
      label: 'Negative',
      value: sd.negative ?? 0,
      icon: TrendingDown,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      pct: Math.round(((sd.negative ?? 0) / total) * 100),
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => {
        const Icon = c.icon
        return (
          <div key={c.label} className="card p-4 animate-slide-up hover:scale-[1.02] transition-transform">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                <Icon size={18} className={c.color} />
              </div>
              {c.pct !== undefined && (
                <span className={`text-xs font-semibold ${c.color}`}>{c.pct}%</span>
              )}
            </div>
            <div className="text-2xl font-bold tracking-tight">{c.value?.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function Charts({ stats }) {
  if (!stats) return null

  const sentimentData = Object.entries(stats.sentiment_distribution ?? {}).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value,
  }))

  const categoryData = Object.entries(stats.category_distribution ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }))

  const CustomPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name }) => {
    if (percent < 0.05) return null
    const rad = (Math.PI / 180)
    const x = cx + (outerRadius + 24) * Math.cos(-midAngle * rad)
    const y = cy + (outerRadius + 24) * Math.sin(-midAngle * rad)
    return (
      <text x={x} y={y} fill="#94a3b8" textAnchor={x > cx ? 'start' : 'end'} fontSize={11}>
        {name} ({(percent * 100).toFixed(0)}%)
      </text>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <BarChart2 size={15} className="text-indigo-400" /> Sentiment Distribution
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={sentimentData} cx="50%" cy="50%" outerRadius={70}
              dataKey="value" labelLine={false} label={CustomPieLabel}>
              {sentimentData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Layers size={15} className="text-purple-400" /> Top Categories
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              cursor={{ fill: 'rgba(99,102,241,0.1)' }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Article card ─────────────────────────────────────────────────────────────
function ArticleCard({ article, onClick }) {
  const [imgErr, setImgErr] = useState(false)
  const ago = formatDistanceToNow(new Date(article.published_at), { addSuffix: true })

  return (
    <div
      onClick={() => onClick(article)}
      className="card cursor-pointer hover:border-indigo-500/40 hover:shadow-indigo-900/20 group animate-slide-up"
    >
      {article.image_url && !imgErr && (
        <div className="relative h-40 overflow-hidden">
          <img
            src={article.image_url}
            alt=""
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-800/90 to-transparent" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <SentimentBadge sentiment={article.sentiment} />
          <CategoryBadge category={article.category} />
          <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
            <Clock size={10} /> {ago}
          </span>
        </div>

        <h3 className="font-semibold leading-snug text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2">
          {article.title}
        </h3>

        <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">
          {article.summary || article.description}
        </p>

        <ScoreBar score={article.sentiment_score} />

        {article.insights?.length > 0 && (
          <div className="space-y-1">
            {article.insights.slice(0, 2).map((ins, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-indigo-400 mt-0.5 shrink-0">▸</span>
                <span className="line-clamp-1">{ins}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
          <span className="text-xs text-slate-500 font-medium">{article.source}</span>
          <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
            Read more →
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Article modal ────────────────────────────────────────────────────────────
function ArticleModal({ article, onClose }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!article) return null
  const ago = formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
  const cfg = SENTIMENT[article.sentiment] ?? SENTIMENT.neutral

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="sticky top-0 z-10 glass p-4 flex items-start justify-between gap-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2 flex-wrap">
            <SentimentBadge sentiment={article.sentiment} />
            <CategoryBadge category={article.category} />
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <h2 className="text-xl font-bold leading-snug">{article.title}</h2>

          <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
            <span className="font-medium text-slate-300">{article.source}</span>
            {article.author && <span>{article.author}</span>}
            <span className="flex items-center gap-1"><Clock size={12} /> {ago}</span>
          </div>

          {/* AI Summary */}
          <div className="p-4 rounded-xl bg-indigo-500/8 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-2 text-indigo-300 text-xs font-semibold uppercase tracking-wide">
              <Zap size={12} /> AI Summary
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{article.summary}</p>
          </div>

          {/* Sentiment gauge */}
          <div className="p-4 rounded-xl bg-surface-900/60 border border-slate-700/40 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Sentiment Analysis</span>
              <span className={`font-semibold ${cfg.text}`}>{cfg.label}</span>
            </div>
            <ScoreBar score={article.sentiment_score} />
          </div>

          {/* Key insights */}
          {article.insights?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-2">
                <BarChart2 size={12} /> Key Insights
              </h4>
              <div className="space-y-2">
                {article.insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface-900/60 text-sm text-slate-300">
                    <span className="text-indigo-400 font-bold mt-0.5">{i + 1}</span>
                    {ins}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keywords */}
          {article.keywords?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-2">
                <Tag size={12} /> Keywords
              </h4>
              <div className="flex flex-wrap gap-2">
                {article.keywords.map((kw, i) => (
                  <span key={i} className="badge bg-slate-700/60 text-slate-300">{kw}</span>
                ))}
              </div>
            </div>
          )}

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost w-full justify-center mt-2"
          >
            <ExternalLink size={14} /> Read Full Article
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Filters bar ──────────────────────────────────────────────────────────────
function FilterBar({ search, setSearch, sentiment, setSentiment, category, setCategory, categories }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search articles, sources…"
            className="input pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select value={sentiment} onChange={e => setSentiment(e.target.value)} className="input w-36 py-2">
            <option value="">All sentiment</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>

        <select value={category} onChange={e => setCategory(e.target.value)} className="input w-36 py-2">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {(search || sentiment || category) && (
          <button
            onClick={() => { setSearch(''); setSentiment(''); setCategory('') }}
            className="btn-ghost"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="btn-ghost px-3">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm text-slate-400">
        Page <span className="text-white font-semibold">{page}</span> of{' '}
        <span className="text-white font-semibold">{totalPages}</span>
      </span>
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="btn-ghost px-3">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center space-y-3 text-slate-500">
      <Newspaper size={48} strokeWidth={1} />
      <p className="font-medium text-slate-300">No articles yet</p>
      <p className="text-sm">Run the pipeline above to fetch and analyse news articles.</p>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [articles, setArticles]     = useState([])
  const [stats, setStats]           = useState(null)
  const [categories, setCategories] = useState([])
  const [selected, setSelected]     = useState(null)
  const [loading, setLoading]       = useState(false)

  // filters
  const [search, setSearch]       = useState('')
  const [sentiment, setSentiment] = useState('')
  const [category, setCategory]   = useState('')
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal]         = useState(0)

  // debounce search
  const searchTimer = useRef(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350)
  }, [search])

  const loadArticles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchArticles({
        page, per_page: 20,
        search: debouncedSearch || undefined,
        sentiment: sentiment || undefined,
        category: category || undefined,
      })
      setArticles(data.articles)
      setTotalPages(data.total_pages)
      setTotal(data.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, sentiment, category])

  const loadStats = useCallback(async () => {
    try {
      const [s, cats] = await Promise.all([fetchStats(), fetchCategories()])
      setStats(s)
      setCategories(cats)
    } catch (e) { console.error(e) }
  }, [])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [debouncedSearch, sentiment, category])

  useEffect(() => { loadArticles() }, [loadArticles])
  useEffect(() => { loadStats() }, [loadStats])

  const onPipelineDone = () => {
    loadArticles()
    loadStats()
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-slate-700/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <Newspaper size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight">News Intelligence</h1>
              <p className="text-xs text-slate-400 hidden sm:block">AI-powered news analysis platform</p>
            </div>
          </div>
          {stats && (
            <div className="hidden sm:flex items-center gap-6 text-xs text-slate-400">
              <span><span className="text-white font-semibold">{stats.total_articles}</span> articles</span>
              <span><span className="text-white font-semibold">{stats.processed_articles}</span> analysed</span>
              <span>
                Avg score:{' '}
                <span className={stats.average_sentiment_score > 0 ? 'text-green-400' : stats.average_sentiment_score < 0 ? 'text-red-400' : 'text-slate-300'}>
                  {stats.average_sentiment_score > 0 ? '+' : ''}{stats.average_sentiment_score.toFixed(2)}
                </span>
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Pipeline */}
        <PipelineBar onDone={onPipelineDone} />

        {/* Stats cards */}
        <StatsPanel stats={stats} />

        {/* Charts */}
        {stats?.processed_articles > 0 && <Charts stats={stats} />}

        {/* Filters */}
        <FilterBar
          search={search} setSearch={setSearch}
          sentiment={sentiment} setSentiment={setSentiment}
          category={category} setCategory={setCategory}
          categories={categories}
        />

        {/* Article count & refresh */}
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {total > 0
              ? <>{total.toLocaleString()} articles{debouncedSearch || sentiment || category ? ' (filtered)' : ''}</>
              : 'No articles found'
            }
          </span>
          <button onClick={() => { loadArticles(); loadStats() }} className="btn-ghost text-xs px-3 py-1.5">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Article grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading && articles.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card h-64 animate-pulse bg-slate-800/40" />
              ))
            : articles.length === 0
              ? <EmptyState />
              : articles.map(art => (
                  <ArticleCard key={art.id} article={art} onClick={setSelected} />
                ))
          }
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </main>

      {selected && <ArticleModal article={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
