"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { severityColor } from "@/components/SeverityBadge"
import type { UserProfile } from "@/lib/api"

interface Props {
  user: UserProfile
}

export function SupportNetwork({ user }: Props) {
  const contacts = user.emergency_contacts
  const userColor = severityColor(user.severity_label)

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-2xl">🤝</div>
        <p className="text-sm text-muted-foreground text-center">No emergency contacts added yet.</p>
        <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
          Add trusted contacts in your profile. They'll be notified with a gentle check-in if your distress reaches Critical.
        </p>
      </div>
    )
  }

  // Radial layout — user in center, contacts arranged in a circle around them
  const cx = 260, cy = 220
  const radius = 140
  const angleStep = (2 * Math.PI) / contacts.length
  const contactPositions = contacts.map((_, i) => {
    const angle = -Math.PI / 2 + i * angleStep
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl border bg-muted/20 overflow-hidden" style={{ height: 440 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${cx * 2} ${cy * 2}`} className="absolute inset-0">
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={userColor} stopOpacity="0.06" />
              <stop offset="100%" stopColor={userColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGrad)" />

          {/* Orbit ring */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth="1"
            strokeDasharray="4 6" opacity="0.5" />

          {/* Edges — user to each contact */}
          {contactPositions.map((pos, i) => (
            <motion.line
              key={i}
              x1={cx} y1={cy} x2={pos.x} y2={pos.y}
              stroke={userColor} strokeWidth="1.5" strokeOpacity="0.25"
              strokeDasharray="5 4"
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
          style={{
            left: cx,
            top: cy,
            transform: "translate(-50%, -50%)",
          }}
        >
          <motion.div
            animate={{ boxShadow: [`0 0 0 0px ${userColor}30`, `0 0 0 12px ${userColor}00`] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-white/80 shadow-lg overflow-hidden p-1"
            style={{ background: `linear-gradient(135deg, ${userColor}30, ${userColor}15)` }}
          >
            <img src="/logo.png" alt="Penumbra" style={{ width: "40px", height: "40px" }} />
          </motion.div>
          <div className="bg-card border rounded-xl px-2.5 py-1 shadow-sm text-center">
            <p className="text-[11px] font-semibold text-foreground">u/{user.username}</p>
            <p className="text-[10px] text-muted-foreground">{user.severity_label}</p>
          </div>
        </motion.div>

        {/* Contact nodes */}
        {contacts.map((contact, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
            whileHover={{ scale: 1.08 }}
            className="absolute flex flex-col items-center gap-1.5"
            style={{
              left: contactPositions[i].x,
              top: contactPositions[i].y,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-card border-2 shadow-md flex items-center justify-center text-lg font-bold text-primary"
              style={{ borderColor: "var(--border)" }}>
              {contact.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="bg-card border rounded-xl px-2.5 py-1 shadow-sm text-center max-w-[100px]">
              <p className="text-[11px] font-semibold text-foreground truncate">{contact.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{contact.contact}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground flex items-center gap-3">
        <div className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden p-0.5" style={{ background: `${userColor}20` }}>
          <img src="/logo.png" alt="" style={{ width: "14px", height: "14px" }} />
        </div>
        <span>
          On <strong className="text-foreground">Critical</strong> severity, {contacts.length} contact{contacts.length > 1 ? "s" : ""} will receive a gentle check-in prompt.
          They will not see your posts or chat history.
        </span>
      </div>
    </div>
  )
}
