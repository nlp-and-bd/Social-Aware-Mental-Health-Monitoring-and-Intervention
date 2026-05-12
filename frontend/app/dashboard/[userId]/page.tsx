"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { api, type UserProfile, type ClassifyResponse, type EvaluateResponse } from "@/lib/api"
import { SeverityTimeline } from "@/components/SeverityTimeline"
import { PostList } from "@/components/PostList"
import { SeverityBreakdown } from "@/components/SeverityBreakdown"
import { ActivityHeatmap } from "@/components/ActivityHeatmap"
import { SupportNetwork } from "@/components/SupportNetwork"
import { CrisisPanel } from "@/components/CrisisPanel"
import { FloatingChat } from "@/components/FloatingChat"
import { ConsentScreen } from "@/components/ConsentScreen"
import { SeverityBadge, severityColor } from "@/components/SeverityBadge"
import { SettingsPanel } from "@/components/SettingsPanel"

// ── Constants ─────────────────────────────────────────────────────────────────
const SEV_GRADIENT: Record<string, [string, string]> = {
  Low:      ["#2d9e8e", "#4db6a8"],
  Medium:   ["#c49a3c", "#d4aa52"],
  High:     ["#c4713c", "#d4834e"],
  Critical: ["#b84040", "#c85858"],
}

const NAV = [
  { id: "overview",        label: "Overview",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "posts",           label: "Posts",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "graph",           label: "Insights",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { id: "recommendations", label: "Actions",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { id: "settings",        label: "Settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
]

// ── Nav button with icon + label ─────────────────────────────────────────────
function NavButton({ item, active, color, onClick }: {
  item: typeof NAV[0]; active: boolean; color: string; onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: active ? 0 : 2 }}
      whileTap={{ scale: 0.97 }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left relative"
      style={{
        background: active ? `${color}14` : "transparent",
        color: active ? color : "var(--muted-foreground)",
        borderLeft: `2px solid ${active ? color : "transparent"}`,
      }}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.7} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
      </svg>
      <span>{item.label}</span>
    </motion.button>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 rounded-2xl border bg-card px-5 py-4 shadow-sm min-w-0"
    >
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold truncate" style={{ color: accent ?? "var(--foreground)" }}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </motion.div>
  )
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div className="flex flex-col items-center gap-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <img src="/logo.png" alt="Penumbra" style={{ width: "56px", height: "56px" }} />
        </motion.div>
        <div className="flex gap-1.5">
          {[0,1,2].map((i) => (
            <motion.div key={i} className="w-2 h-2 rounded-full bg-primary/40"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, delay: i * 0.2, duration: 0.8 }} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </motion.div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()

  const [user, setUser]               = useState<UserProfile | null>(null)
  const [classified, setClassified]   = useState<ClassifyResponse | null>(null)
  const [evaluation, setEvaluation]   = useState<EvaluateResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [classifying, setClassifying] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [activeTab, setActiveTab]     = useState("overview")

  const loadUser = useCallback(async () => {
    // Step 1 — ingest (idempotent: creates user + stores posts if new, no-op if returning)
    try {
      await api.ingest(userId)
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes("backend") || msg.includes("port 8000")) {
        toast.error("Backend is not running. Start it with: uvicorn backend.main:app --reload --port 8002")
      } else {
        toast.error(`User "${userId}" not found in mock data. Valid IDs: u001, u002, u003, u004`)
      }
      setLoading(false)
      return
    }

    // Step 2 — load profile
    let profile: typeof user = null
    try {
      profile = await api.graphUser(userId)
      setUser(profile)
      if (!profile.consent_given) setShowConsent(true)
    } catch {
      toast.error("Profile load failed. Try refreshing.")
      setLoading(false)
      return
    }

    setLoading(false)

    // Step 3 — auto-classify in background (this is what makes posts appear immediately)
    // Only run if there are no classifications yet (first visit)
    if (profile.post_count > 0) {
      try {
        const result = await api.classify(userId)
        setClassified(result)
        const [u, ev] = await Promise.all([api.graphUser(userId), api.evaluate(userId)])
        setUser(u)
        setEvaluation(ev)
      } catch {
        // Silent — user can click Load & Classify manually
      }
    }
  }, [userId])

  const runClassify = useCallback(async () => {
    setClassifying(true)
    try {
      // Ensure user is ingested before classifying
      await api.ingest(userId)
      const result = await api.classify(userId)
      setClassified(result)
      const [u, ev] = await Promise.all([api.graphUser(userId), api.evaluate(userId)])
      setUser(u); setEvaluation(ev)
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setClassifying(false) }
  }, [userId])

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await api.notifications(userId).catch(() => null)
      res?.notifications.forEach((n) => toast(n.message, { icon: "🔔" }))
    }, 10000)
    return () => clearInterval(t)
  }, [userId])

  useEffect(() => { loadUser() }, [loadUser])

  async function handleConsentComplete(username: string, contacts: { name: string; contact: string }[]) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002/api"}/graph/user/${userId}/consent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, username, emergency_contacts: contacts }),
    }).catch(() => null)
    setUser((prev) => prev ? { ...prev, username, consent_given: true, emergency_contacts: contacts } : prev)
    setShowConsent(false)
  }

  function logout() {
    toast("Signed out", { icon: "👋" })
    setTimeout(() => router.push("/"), 500)
  }

  if (loading) return <LoadingScreen />
  if (showConsent) return <ConsentScreen userId={userId} onComplete={handleConsentComplete} />

  const sevLabel   = user?.severity_label ?? "Low"
  const sevScore   = Math.round((user?.severity_score ?? 0) * 100)
  const sevCol     = severityColor(sevLabel)
  const [c1]       = SEV_GRADIENT[sevLabel] ?? ["#6b7280"]
  const initial    = (user?.username ?? userId)[0]?.toUpperCase() ?? "U"

  const lastActive = user?.last_active
    ? new Date(user.last_active).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "—"

  const trendLabel = evaluation?.trend === "worsening" ? "↑ Worsening"
    : evaluation?.trend === "improving" ? "↓ Improving" : "→ Stable"
  const trendColor = evaluation?.trend === "worsening" ? "#b84040"
    : evaluation?.trend === "improving" ? "#2d9e8e" : "var(--muted-foreground)"

  return (
    <motion.div className="flex h-screen bg-background overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r bg-card z-30"
        style={{ boxShadow: "1px 0 0 var(--border)" }}>

        {/* Logo */}
        <div className="px-4 py-3.5 border-b flex items-center gap-2.5">
          <img src="/logo.png" alt="Penumbra" style={{ width: "32px", height: "32px", flexShrink: 0 }} />
          <img src="/name.png" alt="penumbra" style={{ height: "22px", width: "auto" }} />
        </div>

        {/* User pill */}
        <div className="px-3 py-3 border-b">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-muted/40">
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${c1}, ${SEV_GRADIENT[sevLabel]?.[1] ?? c1})` }}>
                {initial}
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card"
                style={{ background: sevCol }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">u/{user?.username ?? userId}</p>
              <p className="text-[10px] text-muted-foreground">{sevLabel} severity</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavButton key={item.id} item={item} active={activeTab === item.id}
              color={c1} onClick={() => setActiveTab(item.id)} />
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 pb-4 pt-2 border-t">
          <motion.button
            whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </motion.button>
        </div>
      </aside>

      {/* ══════════════ MAIN CONTENT ══════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Top bar ── */}
        <header className="flex-shrink-0 border-b bg-card/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-none" style={{ fontFamily: "var(--font-esteban), serif" }}>
                {NAV.find(n => n.id === activeTab)?.label}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                u/{user?.username ?? userId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Critical pill */}
            <AnimatePresence>
              {evaluation?.effective_severity === "Critical" && (
                <motion.button key="crit"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setActiveTab("recommendations")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-3 py-1.5"
                >
                  <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>●</motion.span>
                  Critical — view actions
                </motion.button>
              )}
            </AnimatePresence>

            {/* Classify button */}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={runClassify} disabled={classifying}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 shadow-sm"
              style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
            >
              {classifying ? (
                <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>◌</motion.span>Analysing…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>Load & Classify</>
              )}
            </motion.button>
          </div>
        </header>

        {/* ── Stat cards row ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 flex gap-4">
          <StatCard label="Distress score" value={`${sevScore}%`} sub={sevLabel} accent={sevCol} />
          <StatCard label="Posts analysed" value={user?.post_count ?? 0} sub="from Reddit" />
          <StatCard label="Trend" value={evaluation ? trendLabel : "—"}
            sub={evaluation ? "based on history" : "run classify first"} accent={evaluation ? trendColor : undefined} />
          <StatCard label="Last active" value={lastActive}
            sub={user?.emergency_contacts.length ? `${user.emergency_contacts.length} contact${user.emergency_contacts.length > 1 ? "s" : ""} set` : "no contacts set"} />
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="px-6 pb-6 space-y-5"
            >

              {/* Overview */}
              {activeTab === "overview" && (
                <div className="space-y-5">
                  <AnimatePresence>
                    {evaluation?.effective_severity === "Critical" && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <CrisisPanel />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-foreground">Severity over time</p>
                      <span className="text-xs text-muted-foreground">{user?.severity_history.length ?? 0} data points</span>
                    </div>
                    <SeverityTimeline history={user?.severity_history ?? []} />
                  </div>
                  {/* Emergency contacts inline */}
                  {(user?.emergency_contacts.length ?? 0) > 0 && (
                    <div className="rounded-2xl border bg-card p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Emergency contacts</p>
                      <div className="flex flex-wrap gap-3">
                        {user!.emergency_contacts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {c.name[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-foreground">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{c.contact}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Posts */}
              {activeTab === "posts" && (
                <div className="max-w-2xl mx-auto w-full">
                  <PostList results={classified?.results ?? []} />
                </div>
              )}

              {/* Insights (graph tab) */}
              {activeTab === "graph" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-foreground">Severity breakdown</p>
                        <span className="text-xs text-muted-foreground">{classified?.results.length ?? 0} posts</span>
                      </div>
                      <SeverityBreakdown results={classified?.results ?? []} />
                    </div>
                    <div className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-foreground">Post activity</p>
                        <span className="text-xs text-muted-foreground">Last 12 weeks</span>
                      </div>
                      <ActivityHeatmap results={classified?.results ?? []} />
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-foreground">Support network</p>
                      <span className="text-xs text-muted-foreground">
                        {user?.emergency_contacts.length ?? 0} contact{(user?.emergency_contacts.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {user && <SupportNetwork user={user} />}
                  </div>
                </div>
              )}

              {/* Settings */}
              {activeTab === "settings" && user && (
                <SettingsPanel
                  user={user}
                  onContactsUpdated={(contacts) =>
                    setUser((prev) => prev ? { ...prev, emergency_contacts: contacts } : prev)
                  }
                  onPostsCleared={() => {
                    setClassified(null)
                    setEvaluation(null)
                    setUser((prev) => prev ? { ...prev, post_count: 0, severity_score: 0, severity_label: "Low", severity_history: [] } : prev)
                  }}
                  onAccountDeleted={() => {
                    setTimeout(() => router.push("/"), 500)
                  }}
                />
              )}

              {/* Actions */}
              {activeTab === "recommendations" && (
                <div className="max-w-2xl mx-auto w-full space-y-4">
                  <AnimatePresence>
                    {evaluation?.effective_severity === "Critical" && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <CrisisPanel />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {evaluation ? (
                    <>
                      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
                        <p className="text-sm text-muted-foreground flex-1">Response based on severity</p>
                        <SeverityBadge severity={evaluation.effective_severity} />
                        {evaluation.effective_severity !== evaluation.severity && (
                          <span className="text-xs text-rose-600 font-medium">escalated from {evaluation.severity}</span>
                        )}
                      </div>
                      <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-2.5">
                        <p className="text-sm font-semibold text-foreground mb-3">Recommended steps</p>
                        {evaluation.recommendations.map((r, i) => (
                          <motion.div key={i}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                            className="flex gap-3 items-start p-3.5 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-primary"
                              style={{ background: `${c1}15`, border: `1px solid ${c1}30` }}>{i + 1}</div>
                            <span className="text-sm text-foreground leading-relaxed">{r}</span>
                          </motion.div>
                        ))}
                      </div>
                      {evaluation.helplines.length > 0 && (
                        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-2.5">
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Helplines</p>
                          {evaluation.helplines.map((h) => (
                            <div key={h.name} className="flex items-center justify-between rounded-xl border px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                              <div>
                                <p className="text-sm font-medium text-foreground">{h.name}</p>
                                {h.url && <p className="text-xs text-muted-foreground">{h.url}</p>}
                              </div>
                              <a href={`tel:${h.number.replace(/-/g, "")}`} className="text-sm font-semibold text-primary hover:underline">{h.number}</a>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border bg-card p-12 shadow-sm flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center text-2xl">⚡</div>
                      <p className="text-sm text-muted-foreground text-center">
                        Click <strong>Load & Classify</strong> to see your personalised recommendations.
                      </p>
                    </div>
                  )}
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Floating chat widget */}
      <FloatingChat
        userId={userId}
        onEvaluate={() => api.evaluate(userId).then(setEvaluation).catch(() => null)}
      />
    </motion.div>
  )
}
