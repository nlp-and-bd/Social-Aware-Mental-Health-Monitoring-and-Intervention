"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { api, type AdminUser, type AdminResponse } from "@/lib/api"
import { SeverityBadge, severityColor } from "@/components/SeverityBadge"
import { Users, AlertCircle, AlertTriangle, BarChart2 } from "lucide-react"

const SEV_ORDER = ["Critical", "High", "Medium", "Low"]

function StatCard({ label, value, sub, accent, icon }: {
  label: string; value: string | number; sub?: string; accent?: string; icon: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 rounded-2xl border bg-card px-5 py-4 shadow-sm min-w-0 flex items-start gap-4"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: accent ? `${accent}15` : "var(--muted)" }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        <p className="text-2xl font-bold truncate" style={{ color: accent ?? "var(--foreground)" }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  )
}

function SeverityBar({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden w-full gap-0.5">
      {SEV_ORDER.map((sev) => {
        const count = distribution[sev] ?? 0
        const pct = (count / total) * 100
        if (pct === 0) return null
        return (
          <motion.div
            key={sev}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ background: severityColor(sev) }}
            title={`${sev}: ${count}`}
          />
        )
      })}
    </div>
  )
}

function UserRow({ user, index, onView }: { user: AdminUser; index: number; onView: () => void }) {
  const lastActive = user.last_active
    ? new Date(user.last_active).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
    : "—"
  const initial = (user.username ?? user.user_id)[0]?.toUpperCase() ?? "U"
  const col = severityColor(user.severity_label)

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="border-b border-border/50 hover:bg-muted/30 transition-colors group"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${col}, ${col}cc)` }}>
            {initial}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">u/{user.username}</p>
            <p className="text-[10px] text-muted-foreground">{user.user_id}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <SeverityBadge severity={user.severity_label} />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: col }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(user.severity_score * 100)}%` }}
              transition={{ duration: 0.8, delay: index * 0.04 + 0.2 }}
            />
          </div>
          <span className="text-xs font-semibold text-foreground">{Math.round(user.severity_score * 100)}%</span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-sm text-foreground">{user.classified_count}<span className="text-muted-foreground text-xs"> / {user.post_count}</span></td>
      <td className="px-4 py-3.5 text-sm text-muted-foreground">{lastActive}</td>
      <td className="px-4 py-3.5">
        {user.contacts_count > 0 ? (
          <span className="text-xs font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5">
            {user.contacts_count} set
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">none</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={onView}
          className="text-xs font-semibold text-primary border border-primary/20 rounded-xl px-3 py-1.5 hover:bg-primary/5 transition-colors"
        >
          View →
        </motion.button>
      </td>
    </motion.tr>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [data, setData]           = useState<AdminResponse | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [sortBy, setSortBy]       = useState<"severity" | "score" | "posts" | "active">("severity")
  const [filterSev, setFilterSev] = useState<string>("all")

  // JWT login gate
  const [showLogin, setShowLogin]     = useState(false)
  const [password, setPassword]       = useState("")
  const [loginError, setLoginError]   = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginFocused, setLoginFocused] = useState(false)

  async function handleLogin() {
    if (!password.trim()) return
    setLoginLoading(true)
    setLoginError("")
    try {
      const res = await api.adminLogin(password)
      sessionStorage.setItem("admin_token", res.token)
      setShowLogin(false)
      setPassword("")
      loadData()
    } catch (e: unknown) {
      setLoginError((e as Error).message)
    } finally {
      setLoginLoading(false) }
  }

  function loadData() {
    setLoading(true)
    setError(null)
    api.adminData()
      .then(setData)
      .catch((e: unknown) => {
        const msg = (e as Error).message
        if (msg.includes("401") || msg.includes("token") || msg.includes("Invalid") || msg.includes("expired")) {
          sessionStorage.removeItem("admin_token")
          setShowLogin(true)
        } else {
          setError(msg)
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null
    if (!token) {
      setShowLogin(true)
      setLoading(false)
    } else {
      loadData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sorted = [...(data?.users ?? [])].sort((a, b) => {
    if (sortBy === "severity") return SEV_ORDER.indexOf(a.severity_label) - SEV_ORDER.indexOf(b.severity_label)
    if (sortBy === "score") return b.severity_score - a.severity_score
    if (sortBy === "posts") return b.classified_count - a.classified_count
    if (sortBy === "active") {
      return (b.last_active ?? "").localeCompare(a.last_active ?? "")
    }
    return 0
  }).filter((u) => filterSev === "all" || u.severity_label === filterSev)

  const stats = data?.stats
  const avgScore = data?.users.length
    ? Math.round(data.users.reduce((s, u) => s + u.severity_score, 0) / data.users.length * 100)
    : 0

  return (
    <div className="min-h-screen bg-background relative">

      {/* ── Admin login overlay ── */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="bg-card rounded-2xl border shadow-2xl p-8 w-full max-w-sm space-y-6"
            >
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Penumbra" style={{ width: "36px", height: "36px" }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">Admin Access</p>
                  <p className="text-[11px] text-muted-foreground">Enter the admin password to continue</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password</label>
                <div
                  className="flex items-center rounded-xl border-2 bg-background px-3 py-2.5 transition-all"
                  style={{ borderColor: loginFocused ? "#6d28d9" : "var(--border)", boxShadow: loginFocused ? "0 0 0 3px rgba(109,40,217,0.10)" : "none" }}
                >
                  <input
                    autoFocus
                    type="password"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    onFocus={() => setLoginFocused(true)}
                    onBlur={() => setLoginFocused(false)}
                    disabled={loginLoading}
                  />
                </div>
                {loginError && <p className="text-xs text-rose-500">{loginError}</p>}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleLogin}
                disabled={loginLoading || !password.trim()}
                className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 shadow-sm"
                style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
              >
                {loginLoading ? "Verifying…" : "Access Admin Dashboard"}
              </motion.button>

              <p className="text-center text-[10px] text-muted-foreground/50">
                Set ADMIN_PASSWORD in .env to enable access
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo_with_name.png" alt="Penumbra" style={{ height: "32px", width: "auto" }} />
            <div className="h-5 w-px bg-border" />
            <div>
              <p className="text-xs font-semibold text-foreground">Admin Dashboard</p>
              <p className="text-[10px] text-muted-foreground">Population-level view</p>
            </div>
          </div>
          <motion.button
            whileHover={{ x: -2 }} whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted/40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            User Login
          </motion.button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-7">

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2, repeat: Infinity }}>
              <img src="/logo.png" alt="Penumbra" style={{ width: "48px", height: "48px" }} />
            </motion.div>
            <div className="flex gap-1.5">
              {[0,1,2].map((i) => (
                <motion.div key={i} className="w-2 h-2 rounded-full bg-primary/40"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, delay: i * 0.2, duration: 0.8 }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-sm text-rose-700 space-y-1">
            <p className="font-semibold">Failed to load admin data</p>
            <p className="text-xs opacity-80">{error}</p>
            <p className="text-xs opacity-60">Make sure the backend is running: <code>uvicorn backend.main:app --reload --reload-dir backend --port 8002</code></p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Stats row */}
            <div className="flex gap-4 flex-wrap">
              <StatCard label="Total users" value={stats?.total_users ?? 0} sub="in the system" icon={<Users className="w-5 h-5 text-muted-foreground" />} />
              <StatCard label="Critical" value={stats?.critical_count ?? 0}
                sub="need immediate attention" accent="#b84040" icon={<AlertCircle className="w-5 h-5" style={{ color: "#b84040" }} />} />
              <StatCard label="High severity" value={stats?.high_count ?? 0}
                sub="elevated distress" accent="#c4713c" icon={<AlertTriangle className="w-5 h-5" style={{ color: "#c4713c" }} />} />
              <StatCard label="Avg distress" value={`${avgScore}%`}
                sub="across all users" accent="#6d28d9" icon={<BarChart2 className="w-5 h-5" style={{ color: "#6d28d9" }} />} />
            </div>

            {/* Severity distribution bar */}
            <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Severity distribution</p>
                <span className="text-xs text-muted-foreground">{stats?.total_users ?? 0} users total</span>
              </div>
              <SeverityBar distribution={stats?.severity_distribution ?? {}} />
              <div className="flex gap-5 flex-wrap">
                {SEV_ORDER.map((sev) => {
                  const count = stats?.severity_distribution[sev] ?? 0
                  const total = stats?.total_users ?? 1
                  return (
                    <div key={sev} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2 h-2 rounded-full" style={{ background: severityColor(sev) }} />
                      {sev}: <span className="font-semibold text-foreground">{count}</span>
                      <span className="opacity-60">({Math.round(count / total * 100)}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* User table */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              {/* Table toolbar */}
              <div className="px-5 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm font-semibold text-foreground">All users</p>
                <div className="flex items-center gap-3">
                  {/* Filter */}
                  <div className="flex gap-1.5">
                    {["all", ...SEV_ORDER].map((s) => (
                      <button
                        key={s}
                        onClick={() => setFilterSev(s)}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium"
                        style={{
                          background: filterSev === s ? `${severityColor(s === "all" ? "Low" : s)}15` : "transparent",
                          borderColor: filterSev === s ? severityColor(s === "all" ? "Low" : s) : "var(--border)",
                          color: filterSev === s ? severityColor(s === "all" ? "Low" : s) : "var(--muted-foreground)",
                        }}
                      >
                        {s === "all" ? "All" : s}
                      </button>
                    ))}
                  </div>
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="text-xs rounded-xl border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="severity">Sort: Severity</option>
                    <option value="score">Sort: Score</option>
                    <option value="posts">Sort: Posts</option>
                    <option value="active">Sort: Last active</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      {["User", "Severity", "Score", "Posts (classified)", "Last active", "Contacts", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {sorted.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-5 py-16 text-center text-sm text-muted-foreground">
                            No users found. Run ingest for at least one user first.
                          </td>
                        </tr>
                      ) : (
                        sorted.map((u, i) => (
                          <UserRow key={u.user_id} user={u} index={i}
                            onView={() => router.push(`/dashboard/${u.user_id}?admin=1`)} />
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {sorted.length > 0 && (
                <div className="px-5 py-3 border-t bg-muted/10 text-xs text-muted-foreground">
                  Showing {sorted.length} of {data.users.length} users
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
