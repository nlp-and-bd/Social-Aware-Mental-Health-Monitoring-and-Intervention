"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { toast } from "sonner"
import { api, type UserProfile, type ClassifyResponse, type EvaluateResponse } from "@/lib/api"
import { SeverityTimeline } from "@/components/SeverityTimeline"
import { PostList } from "@/components/PostList"
import { SeverityBreakdown } from "@/components/SeverityBreakdown"
import { ActivityHeatmap } from "@/components/ActivityHeatmap"
import { SupportNetwork } from "@/components/SupportNetwork"
import { CrisisPanel } from "@/components/CrisisPanel"
import { SupportPopup } from "@/components/SupportPopup"
import { FloatingChat } from "@/components/FloatingChat"
import { NatureBackground } from "@/components/NatureBackground"
import { ConsentScreen } from "@/components/ConsentScreen"
import { SeverityBadge, severityColor } from "@/components/SeverityBadge"
import { SettingsPanel } from "@/components/SettingsPanel"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Bell, LogOut, Zap } from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────────────────
const SEV_GRADIENT: Record<string, [string, string]> = {
  Low:      ["#2d9e8e", "#4db6a8"],
  Medium:   ["#9c7a2e", "#b8923f"],
  High:     ["#c4713c", "#d4834e"],
  Critical: ["#b84040", "#c85858"],
}

const NAV = [
  { id: "overview",        label: "Overview",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "recommendations", label: "Actions",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { id: "posts",           label: "Posts",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
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
function StatCard({ label, value, sub, accent, index = 0, glow = false }: {
  label: string; value: string | number; sub?: string; accent?: string; index?: number; glow?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="glass lift flex-1 rounded-3xl px-5 py-4 min-w-0 relative overflow-hidden"
    >
      {/* accent glow for the headline metric */}
      {glow && accent && (
        <div className="absolute -top-8 -right-6 w-28 h-28 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)` }} />
      )}
      <div className="relative">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
        <p className="text-[1.7rem] leading-none font-bold truncate" style={{ color: accent ?? "var(--foreground)" }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      </div>
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
  const searchParams = useSearchParams()
  const isAdmin = searchParams.get("admin") === "1"
  const reduceMotion = useReducedMotion()

  const [user, setUser]               = useState<UserProfile | null>(null)
  const [classified, setClassified]   = useState<ClassifyResponse | null>(null)
  const [evaluation, setEvaluation]   = useState<EvaluateResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [showConsent, setShowConsent] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [activeTab, setActiveTab]     = useState("overview")
  const [outreach, setOutreach]       = useState<{ contact: string; nonce: number } | null>(null)

  const loadUser = useCallback(async () => {
    // Admin view — strictly read-only. No ingest, no classify, no DB writes; the
    // user's data must look exactly the same after an admin inspects the profile.
    if (isAdmin) {
      let profile: typeof user = null
      try {
        profile = await api.graphUser(userId)
        setUser(profile)
      } catch {
        toast.error("Profile load failed. Try refreshing.")
        setLoading(false)
        return
      }
      setLoading(false)
      try {
        // classifiedPosts + evaluate are both read-only on the backend.
        const [result, ev] = await Promise.all([
          api.classifiedPosts(userId),
          api.evaluate(userId),
        ])
        setClassified(result)
        setEvaluation(ev)
      } catch (e: unknown) {
        toast.error((e as Error).message)
      }
      return
    }

    // Step 1 — ingest (idempotent: creates user + stores posts if new, no-op if returning)
    try {
      await api.ingest(userId)
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes("backend") || msg.includes("port 8002")) {
        toast.error("Backend is not running. Start it with: uvicorn backend.main:app --reload --reload-dir backend --port 8002")
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

    // Step 3 — always classify + evaluate on every login
    // Classify endpoint returns existing results if already done (idempotent)
    try {
      const result = await api.classify(userId)
      setClassified(result)
      const [u, ev] = await Promise.all([api.graphUser(userId), api.evaluate(userId)])
      setUser(u)
      setEvaluation(ev)
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }, [userId, isAdmin])

  useEffect(() => {
    // Don't poll (or pop) notifications in admin view — popping mutates the user's queue.
    if (isAdmin) return
    const t = setInterval(async () => {
      const res = await api.notifications(userId).catch(() => null)
      res?.notifications.forEach((n) => toast(n.message, { icon: <Bell className="w-4 h-4" /> }))
    }, 10000)
    return () => clearInterval(t)
  }, [userId, isAdmin])

  useEffect(() => { loadUser() }, [loadUser])

  // "You deserve support" popup — fires the first time a user is seen at Critical
  // in a session. Covers both paths: already Critical at sign-in, and newly pushed
  // to Critical by fresh posts (evaluate() resolves to the same effective_severity).
  // Once per session so it never nags on tab switches or reloads.
  useEffect(() => {
    if (isAdmin || showConsent) return
    if (evaluation?.effective_severity !== "Critical") return
    if (typeof window === "undefined") return
    const key = `penumbra_support_popup_${userId}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, "1")
    setShowSupport(true)
  }, [evaluation, isAdmin, showConsent, userId])

  async function handleConsentComplete(username: string, displayName: string, contacts: { name: string; contact: string; notify: boolean; details_consent: boolean }[]) {
    const payload = contacts.map((c) => ({ ...c, email_type: "check_in" as const }))
    await api.saveConsent(userId, username, displayName, payload).catch(() => null)
    setUser((prev) => prev ? { ...prev, username, display_name: displayName, consent_given: true, emergency_contacts: payload } : prev)
    setShowConsent(false)
  }

  function logout() {
    toast("Signed out", { icon: <LogOut className="w-4 h-4" /> })
    setTimeout(() => router.push("/"), 500)
  }

  if (loading) return <LoadingScreen />
  if (showConsent && !isAdmin) return <ConsentScreen userId={userId} onComplete={handleConsentComplete} />

  const sevLabel   = user?.severity_label ?? "Low"
  const sevScore   = Math.round((user?.severity_score ?? 0) * 100)
  const sevCol     = severityColor(sevLabel)
  const [c1]       = SEV_GRADIENT[sevLabel] ?? ["#6b7280"]
  const displayName = user?.display_name?.trim() || user?.username || userId
  const initial    = displayName[0]?.toUpperCase() ?? "U"

  const lastActive = user?.last_active
    ? new Date(user.last_active).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "—"

  const trendLabel = evaluation?.trend === "worsening" ? "↑ Worsening"
    : evaluation?.trend === "improving" ? "↓ Improving" : "→ Stable"
  const trendColor = evaluation?.trend === "worsening" ? "var(--trend-worse)"
    : evaluation?.trend === "improving" ? "var(--trend-improve)" : "var(--muted-foreground)"

  return (
    <motion.div className="flex h-screen overflow-hidden relative"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* Painterly ambient backdrop — sits behind all content */}
      <NatureBackground />

      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside className="hidden md:flex w-52 flex-shrink-0 flex-col glass-strong z-30 relative"
        style={{ borderRight: "1px solid color-mix(in oklch, var(--border) 70%, transparent)" }}>

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
              <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
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

        {/* Theme + Sign out */}
        <div className="px-3 pb-4 pt-2 border-t space-y-0.5">
          <ThemeToggle />
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
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">

        {/* ── Top bar ── */}
        <header className="flex-shrink-0 px-4 md:px-6 py-3 flex items-center justify-between gap-4"
          style={{ borderBottom: "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
                   background: "color-mix(in oklch, var(--card) 60%, transparent)", backdropFilter: "blur(14px)" }}>
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
            {/* Admin read-only badge */}
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/25 rounded-full px-3 py-1.5 whitespace-nowrap flex-shrink-0 hover:bg-primary/15 transition-colors"
                title="Viewing as admin — read-only. Posts are shown as last analysed; no re-ingest or re-classify runs."
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Admin · read-only
              </button>
            )}

            {/* Critical pill */}
            <AnimatePresence>
              {evaluation?.effective_severity === "Critical" && (
                <motion.button key="crit"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setActiveTab("recommendations")}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50/90 border border-rose-200 rounded-full px-3.5 py-1.5 whitespace-nowrap flex-shrink-0 shadow-sm"
                >
                  <motion.span
                    animate={reduceMotion ? {} : { scale: [1, 1.4, 1] }}
                    transition={reduceMotion ? {} : { repeat: 5, duration: 1.4 }}
                  >●</motion.span>
                  Critical — view actions
                </motion.button>
              )}
            </AnimatePresence>

          </div>
        </header>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="px-4 md:px-6 pt-5 pb-44 space-y-5"
            >

              {/* Overview — analytics home */}
              {activeTab === "overview" && (
                <div className="space-y-5">
                  {/* Stat cards — scroll with Overview, not pinned across tabs */}
                  <div className="grid grid-cols-2 md:flex gap-3 md:gap-4">
                    <StatCard index={0} glow label="Distress score" value={`${sevScore}%`} sub={sevLabel} accent={sevCol} />
                    <StatCard index={1} label="Posts analysed" value={user?.post_count ?? 0} sub="total" />
                    <StatCard index={2} label="Last active" value={lastActive}
                      sub={user?.emergency_contacts.length ? `${user.emergency_contacts.length} contact${user.emergency_contacts.length > 1 ? "s" : ""} set` : "no contacts set"} />
                  </div>

                  <AnimatePresence>
                    {evaluation?.effective_severity === "Critical" && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <CrisisPanel userId={userId} contacts={user?.emergency_contacts ?? []} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Two-up — distribution + activity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="glass rounded-3xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-foreground">Severity breakdown</p>
                        <span className="text-xs text-muted-foreground">{classified?.results.length ?? 0} posts</span>
                      </div>
                      <SeverityBreakdown results={classified?.results ?? []} />
                    </div>
                    <div className="glass rounded-3xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-foreground">Post activity</p>
                        <span className="text-xs text-muted-foreground">Last 12 weeks</span>
                      </div>
                      <ActivityHeatmap results={classified?.results ?? []} />
                    </div>
                  </div>

                  {/* Severity over time — bottom */}
                  <div className="glass rounded-3xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-foreground">Severity over time</p>
                      <span className="text-xs text-muted-foreground">{user?.severity_history.length ?? 0} data points</span>
                    </div>
                    <SeverityTimeline history={user?.severity_history ?? []} />
                  </div>
                </div>
              )}

              {/* Posts */}
              {activeTab === "posts" && (
                <div className="max-w-2xl mx-auto w-full">
                  <PostList results={classified?.results ?? []} />
                </div>
              )}

              {/* Settings */}
              {activeTab === "settings" && user && (
                <SettingsPanel
                  user={user}
                  onContactsUpdated={(contacts, displayName) =>
                    setUser((prev) => prev ? { ...prev, emergency_contacts: contacts, display_name: displayName || prev.display_name } : prev)
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
                <div className="flex flex-col md:flex-row gap-5 items-start">
                  {/* Left column */}
                  <div className="flex-1 min-w-0 space-y-4">
                    {/* Support network + contact alert */}
                    <div className="glass rounded-3xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Support network</p>
                        <span className="text-xs text-muted-foreground">
                          {user?.emergency_contacts.length ?? 0} contact{(user?.emergency_contacts.length ?? 0) !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {user && (
                        <SupportNetwork
                          user={user}
                          height={260}
                          onContactClick={(c) => setOutreach({ contact: c.contact, nonce: Date.now() })}
                        />
                      )}
                      <CrisisPanel userId={userId} contacts={user?.emergency_contacts ?? []} compact openRequest={outreach} />
                    </div>

                    {/* Recommended steps */}
                    {evaluation ? (
                      <div className="glass rounded-3xl p-5 space-y-2.5">
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
                    ) : (
                      <div className="glass rounded-3xl p-12 flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center"><Zap className="w-7 h-7 text-muted-foreground" /></div>
                        <p className="text-sm text-muted-foreground text-center">
                          Analysing your posts — recommendations will appear shortly.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right column — helplines (broader, sticky) */}
                  {(evaluation?.helplines.length ?? 0) > 0 && (
                    <div className="w-full md:w-80 flex-shrink-0">
                      <div className="glass rounded-3xl p-5 space-y-2.5 md:sticky md:top-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Support lines</p>
                        {evaluation!.helplines.map((h) => (
                          <div key={h.name} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground leading-snug truncate">{h.name}</p>
                              {h.url && <p className="text-[10px] text-muted-foreground truncate">{h.url}</p>}
                            </div>
                            {h.number && (
                              <a href={`tel:${h.number.replace(/-/g, "")}`}
                                className="text-sm font-semibold text-primary hover:underline flex-shrink-0">
                                {h.number}
                              </a>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground/50 text-center pt-1">
                          Immediate danger? Call <strong>112</strong>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile bottom nav — replaces the sidebar under md */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t flex justify-around px-1 py-1.5"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
        {NAV.map((item) => {
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 min-h-[44px] flex-1 rounded-lg text-[10px] font-medium min-w-0"
              style={{ color: active ? c1 : "var(--muted-foreground)" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.7} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Floating chat widget — hidden in admin view so it can't write to the user's chat history */}
      {!isAdmin && (
        <FloatingChat
          userId={userId}
          onEvaluate={() => api.evaluate(userId).then(setEvaluation).catch(() => null)}
        />
      )}

      {/* "You deserve support" popup — once per session when Critical (never in admin view) */}
      {!isAdmin && (
        <SupportPopup
          open={showSupport}
          displayName={user?.display_name?.trim() || undefined}
          helplines={evaluation?.helplines}
          hasContacts={(user?.emergency_contacts.filter((c) => c.notify !== false && c.contact).length ?? 0) > 0}
          onReachOut={() => { setShowSupport(false); setActiveTab("recommendations") }}
          onClose={() => setShowSupport(false)}
        />
      )}
    </motion.div>
  )
}
