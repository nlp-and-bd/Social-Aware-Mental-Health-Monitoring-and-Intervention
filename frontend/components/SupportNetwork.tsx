"use client"

import { motion } from "framer-motion"
import { HeartHandshake } from "lucide-react"
import { severityColor } from "@/components/SeverityBadge"
import type { UserProfile } from "@/lib/api"

type Contact = UserProfile["emergency_contacts"][number]

interface Props {
  user: UserProfile
  /** When provided, contact nodes become buttons that open the alert flow for that contact. */
  onContactClick?: (contact: Contact) => void
  /** Graph height in px (default compact). */
  height?: number
}

export function SupportNetwork({ user, onContactClick, height = 320 }: Props) {
  const contacts = user.emergency_contacts
  const userColor = severityColor(user.severity_label)

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-56 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center"><HeartHandshake className="w-6 h-6 text-muted-foreground" /></div>
        <p className="text-sm text-muted-foreground text-center">No emergency contacts added yet.</p>
        <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
          Add trusted contacts in your profile. They&apos;ll be notified with a gentle check-in if your distress reaches Critical.
        </p>
      </div>
    )
  }

  // Radial layout in viewBox units. Nodes are positioned by PERCENTAGE of the
  // container and the SVG stretches to fill (preserveAspectRatio="none"), so the
  // lines and the HTML nodes stay aligned at any container width/height.
  const VW = 520, VH = 440
  const cx = VW / 2, cy = VH / 2
  const radius = 150
  const angleStep = (2 * Math.PI) / contacts.length
  const positions = contacts.map((_, i) => {
    const angle = -Math.PI / 2 + i * angleStep
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
  const pct = (v: number, total: number) => `${(v / total) * 100}%`
  const clickable = !!onContactClick

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl border bg-muted/20 overflow-hidden" style={{ height }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0">
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={userColor} stopOpacity="0.06" />
              <stop offset="100%" stopColor={userColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGrad)" />
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth="1"
            strokeDasharray="4 6" opacity="0.5" vectorEffect="non-scaling-stroke" />
          {positions.map((pos, i) => (
            <motion.line
              key={i}
              x1={cx} y1={cy} x2={pos.x} y2={pos.y}
              stroke={userColor} strokeWidth="1.5" strokeOpacity="0.25" strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
            />
          ))}
        </svg>

        {/* Center node — current user */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
          className="absolute flex flex-col items-center gap-1.5"
          style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
        >
          <motion.div
            animate={{ boxShadow: [`0 0 0 0px ${userColor}30`, `0 0 0 12px ${userColor}00`] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-white/80 shadow-lg overflow-hidden p-1"
            style={{ background: `linear-gradient(135deg, ${userColor}30, ${userColor}15)` }}
          >
            <img src="/logo.png" alt="Penumbra" style={{ width: "34px", height: "34px" }} />
          </motion.div>
          <div className="bg-card border rounded-xl px-2.5 py-1 shadow-sm text-center">
            <p className="text-[11px] font-semibold text-foreground">u/{user.username}</p>
            <p className="text-[10px] text-muted-foreground">{user.severity_label}</p>
          </div>
        </motion.div>

        {/* Contact nodes */}
        {contacts.map((contact, i) => {
          const node = (
            <>
              <div className="w-11 h-11 rounded-full bg-card border-2 shadow-md flex items-center justify-center text-base font-bold text-primary transition-colors"
                style={{ borderColor: clickable ? `${userColor}66` : "var(--border)" }}>
                {contact.name[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="bg-card border rounded-xl px-2.5 py-1 shadow-sm text-center max-w-[100px]">
                <p className="text-[11px] font-semibold text-foreground truncate">{contact.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{contact.contact}</p>
              </div>
            </>
          )
          return (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
              whileHover={{ scale: 1.08 }}
              className="absolute flex flex-col items-center gap-1.5"
              style={{ left: pct(positions[i].x, VW), top: pct(positions[i].y, VH), transform: "translate(-50%, -50%)" }}
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onContactClick?.(contact)}
                  aria-label={`Send an alert to ${contact.name}`}
                  className="flex flex-col items-center gap-1.5 rounded-2xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {node}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1.5">{node}</div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Hint / legend */}
      {clickable ? (
        <p className="text-[11px] text-muted-foreground text-center">
          Tap a contact to send them a check-in, a summary, or your own message.
        </p>
      ) : (
        <div className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground flex items-center gap-3">
          <div className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden p-0.5" style={{ background: `${userColor}20` }}>
            <img src="/logo.png" alt="" style={{ width: "14px", height: "14px" }} />
          </div>
          <span>
            On <strong className="text-foreground">Critical</strong> severity, {contacts.length} contact{contacts.length > 1 ? "s" : ""} will receive a gentle check-in prompt.
            They will not see your posts or chat history.
          </span>
        </div>
      )}
    </div>
  )
}
