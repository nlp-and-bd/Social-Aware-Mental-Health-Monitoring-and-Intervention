"use client"

import { motion } from "framer-motion"
import { SeverityBadge } from "@/components/SeverityBadge"
import type { UserProfile } from "@/lib/api"

const SEV_GRADIENT: Record<string, [string, string]> = {
  Low:      ["#2d9e8e", "#4db6a8"],
  Medium:   ["#c49a3c", "#d4aa52"],
  High:     ["#c4713c", "#d4834e"],
  Critical: ["#b84040", "#c85858"],
}

const TREND_CFG = {
  worsening: { label: "↑ Worsening", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  improving:  { label: "↓ Improving", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  stable:     { label: "→ Stable",    cls: "bg-stone-100 text-stone-500 border-stone-200" },
}

function RingProgress({ score, severity }: { score: number; severity: string }) {
  const R = 44
  const circ = 2 * Math.PI * R
  const [c1, c2] = SEV_GRADIENT[severity] ?? ["#6b7280", "#9ca3af"]
  const id = `rg-${severity}`

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx="56" cy="56" r={R} fill="none" stroke="currentColor" strokeWidth="8"
          className="text-muted/60" />
        {/* Progress */}
        <motion.circle
          cx="56" cy="56" r={R}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-bold text-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {score}%
        </motion.span>
        <span className="text-[10px] text-muted-foreground mt-0.5">distress</span>
      </div>
    </div>
  )
}

export function UserOverviewCard({ user, trend }: { user: UserProfile; trend?: string }) {
  const score = Math.round(user.severity_score * 100)
  const lastActive = user.last_active
    ? new Date(user.last_active).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—"
  const trendInfo = trend ? TREND_CFG[trend as keyof typeof TREND_CFG] : null
  const [c1] = SEV_GRADIENT[user.severity_label] ?? ["#6b7280", "#9ca3af"]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-2xl overflow-hidden border shadow-sm bg-card"
    >
      {/* Top gradient strip */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${SEV_GRADIENT[user.severity_label]?.join(", ") ?? "#6b7280, #9ca3af"})` }} />

      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none opacity-[0.04]"
        style={{ background: `radial-gradient(circle, ${c1}, transparent)`, transform: "translate(30%, -30%)" }} />

      <div className="relative p-6">
        <div className="flex items-center gap-6">
          <RingProgress score={score} severity={user.severity_label} />

          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">User profile</p>
            <h2 className="text-2xl text-foreground truncate mb-3">u/{user.username}</h2>

            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity={user.severity_label} score={user.severity_score} />
              {trendInfo && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${trendInfo.cls}`}>
                  {trendInfo.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: "Posts analysed", value: user.post_count },
            { label: "Last active", value: lastActive },
            { label: "Contacts set", value: user.emergency_contacts.length || "—" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="bg-muted/40 rounded-xl p-3 text-center border border-border/40"
            >
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
