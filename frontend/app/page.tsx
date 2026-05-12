"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

const DEMO_USERS = [
  { id: "u001", label: "Critical",  dot: "#b84040", bg: "hover:bg-rose-50/80 border-rose-100" },
  { id: "u002", label: "Low",       dot: "#2d9e8e", bg: "hover:bg-teal-50/80 border-teal-100" },
  { id: "u003", label: "Low",       dot: "#2d9e8e", bg: "hover:bg-teal-50/80 border-teal-100" },
  { id: "u004", label: "Medium",    dot: "#c49a3c", bg: "hover:bg-amber-50/80 border-amber-100" },
]

const FEATURES = [
  { icon: "◎", text: "Passively monitors Reddit posts for distress signals" },
  { icon: "◎", text: "AI-powered empathetic listening and guidance" },
  { icon: "◎", text: "Gently alerts trusted people when you need support most" },
]

export default function Home() {
  const router = useRouter()
  const [userId, setUserId] = useState("")
  const [focused, setFocused] = useState(false)

  function go(id: string) {
    if (id.trim()) router.push(`/dashboard/${id.trim()}`)
  }

  return (
    <div className="min-h-screen flex overflow-hidden">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-14 overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0d0a1a 0%, #120d24 50%, #1a1035 100%)" }}>

        {/* Animated orbs */}
        {[
          { size: 420, x: -120, y: -120, delay: 0 },
          { size: 300, x: "60%", y: "55%", delay: 1.2 },
          { size: 200, x: "30%", y: "75%", delay: 0.6 },
        ].map((orb, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: orb.size,
              height: orb.size,
              left: orb.x,
              top: orb.y,
              background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
            }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 6 + i * 1.5, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
          />
        ))}

        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 12 }}
          transition={{ duration: 0.6 }}
          className="relative flex items-center gap-3"
        >
          <img src="/logo_with_name.png" alt="Penumbra" style={{ height: "100px", width: "auto" }} />
        </motion.div>

        {/* Hero text */}
        <div className="relative space-y-7">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-[3.2rem] leading-[1.15] text-white"
          >
            Mental health,<br />
            <span className="text-white/75 italic">understood early.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-white/65 text-[1.05rem] leading-relaxed max-w-[360px]"
          >
            A quiet companion that listens, reflects, and reaches out — before things reach a tipping point.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="space-y-3"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.12 }}
                className="flex items-start gap-3 text-white/60 text-sm"
              >
                <span className="text-purple-400/60 text-[10px] mt-1 flex-shrink-0">{f.icon}</span>
                {f.text}
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="relative flex items-center justify-between"
        >
          <p className="text-white/30 text-xs">Not a medical service · For early awareness only</p>
          <Link href="/admin"
            className="text-white/30 hover:text-white/60 text-xs transition-colors underline underline-offset-2">
            Admin →
          </Link>
        </motion.div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative overflow-hidden">

        {/* Soft background texture */}
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: "radial-gradient(circle, rgba(167,139,250,0.25) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative w-full max-w-[360px] space-y-9"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-2">
            <img src="/logo_with_name.png" alt="Penumbra" style={{ height: "44px", width: "auto" }} />
          </div>

          <div>
            <h2 className="text-[2rem] text-foreground mb-1.5 leading-tight">Welcome back</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Enter your user ID to open your personal dashboard.
            </p>
          </div>

          {/* Input group */}
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">User ID</label>
              <motion.div
                animate={{ scale: focused ? 1.01 : 1 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <input
                  className="w-full rounded-2xl border-2 bg-card px-5 py-3.5 text-sm focus:outline-none transition-all duration-200 shadow-sm"
                  style={{
                    borderColor: focused ? "#7c3aed" : "var(--border)",
                    boxShadow: focused ? "0 0 0 4px rgba(124,58,237,0.10)" : "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                  placeholder="e.g. u001"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => e.key === "Enter" && go(userId)}
                />
              </motion.div>
            </div>

            <motion.button
              whileHover={{ scale: 1.015, opacity: 0.95 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => go(userId)}
              disabled={!userId.trim()}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-200 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)", color: "#fff" }}
            >
              Open Dashboard →
            </motion.button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest">Demo users</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Demo user grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {DEMO_USERS.map((u, i) => (
              <motion.button
                key={u.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(0,0,0,0.08)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => go(u.id)}
                className={`border rounded-2xl px-4 py-3 text-left transition-all duration-200 bg-card ${u.bg}`}
              >
                <p className="font-semibold text-sm text-foreground">{u.id}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: u.dot }} />
                  <p className="text-[11px] text-muted-foreground">{u.label} severity</p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
