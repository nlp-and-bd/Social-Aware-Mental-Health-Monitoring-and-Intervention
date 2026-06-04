"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { api } from "@/lib/api"
import { ThemeToggle } from "@/components/ThemeToggle"

const DEMO_USERS = [
  { id: "u001", label: "Critical",  dot: "#b84040" },
  { id: "u002", label: "Low",       dot: "#2d9e8e" },
  { id: "u003", label: "High",      dot: "#c4713c" },
  { id: "u004", label: "Medium",    dot: "#c49a3c" },
]

const FEATURES = [
  { text: "Passively monitors Reddit posts for distress signals" },
  { text: "AI-powered empathetic listening and guidance" },
  { text: "Gently alerts trusted people when you need support most" },
]

// Reddit alien SVG icon
function RedditIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path d="M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10s4.477 10 10 10 10-4.477 10-10zm-9.994-1.4c-.34 0-.616.276-.616.617 0 .34.276.616.616.616s.616-.276.616-.616-.276-.617-.616-.617zm3.988 0c-.34 0-.616.276-.616.617 0 .34.276.616.616.616s.616-.276.616-.616-.276-.617-.616-.617zM10 15.5c-2.21 0-4-1.343-4-3 0 0 .895.5 4 .5s4-.5 4-.5c0 1.657-1.79 3-4 3zm7.5-5.5c0 .828-.672 1.5-1.5 1.5-.372 0-.71-.136-.97-.36C14.27 12.25 12.26 13 10 13s-4.27-.75-5.03-1.86c-.26.224-.598.36-.97.36-.828 0-1.5-.672-1.5-1.5 0-.787.606-1.432 1.378-1.492-.127-.315-.378-.538-.378-.508 0-2.21 2.91-4 6.5-4s6.5 1.79 6.5 4c0-.03-.251.193-.378.508C17.394 9.068 18 9.713 18 10.5z"/>
    </svg>
  )
}

export default function Home() {
  const router = useRouter()
  const [showModal, setShowModal]   = useState(false)
  const [username, setUsername]     = useState("")
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState("")
  const [focused, setFocused]       = useState(false)

  async function handleRedditLogin() {
    const name = username.trim().replace(/^u\//, "")
    if (!name) { setError("Please enter your Reddit username."); return }
    setError("")
    setLoading(true)
    try {
      const res = await api.mockLogin(name)
      router.push(`/dashboard/${res.user_id}`)
    } catch (e: unknown) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  function goDemo(id: string) {
    router.push(`/dashboard/${id}`)
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
          <motion.div key={i} className="absolute rounded-full pointer-events-none"
            style={{ width: orb.size, height: orb.size, left: orb.x, top: orb.y,
              background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)" }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 6 + i * 1.5, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
          />
        ))}

        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="relative flex items-center gap-3">
          <img src="/logo.png" alt="Penumbra" style={{ width: "48px", height: "48px" }} />
          <img src="/name.png" alt="penumbra" style={{ height: "28px", width: "auto" }} />
        </motion.div>

        <div className="relative space-y-7">
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-[3.2rem] leading-[1.15] text-white">
            Mental health,<br />
            <span className="text-white/75 italic">understood early.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-white/65 text-[1.05rem] leading-relaxed max-w-[360px]">
            A quiet companion that listens, reflects, and reaches out — before things reach a tipping point.
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }} className="space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.text} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.12 }}
                className="flex items-start gap-3 text-white/60 text-sm">
                <span className="text-purple-400/60 text-[10px] mt-1 flex-shrink-0">◎</span>
                {f.text}
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
          className="relative flex items-center justify-between">
          <p className="text-white/30 text-xs">Not a medical service · For early awareness only</p>
          <Link href="/admin" className="text-white/30 hover:text-white/60 text-xs transition-colors underline underline-offset-2">
            Admin →
          </Link>
        </motion.div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative overflow-hidden">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle compact />
        </div>

        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: "radial-gradient(circle, rgba(167,139,250,0.25) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative w-full max-w-[360px] space-y-8">

          {/* Mobile logo */}
          <div className="lg:hidden mb-2 flex items-center gap-3">
            <img src="/logo.png" alt="Penumbra" style={{ width: "36px", height: "36px" }} />
            <img src="/name.png" alt="penumbra" style={{ height: "22px", width: "auto" }} />
          </div>

          <div>
            <h2 className="text-[2rem] text-foreground mb-1.5 leading-tight">Welcome</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Sign in with your Reddit account to open your personal dashboard.
            </p>
          </div>

          {/* Reddit login button */}
          <motion.button
            whileHover={{ scale: 1.02, opacity: 0.93 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { setShowModal(true); setError(""); setUsername("") }}
            className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-sm font-bold text-white shadow-lg transition-all"
            style={{ background: "#FF4500" }}
          >
            <RedditIcon size={20} />
            Continue with Reddit
          </motion.button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Demo accounts</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Demo user grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {DEMO_USERS.map((u) => (
              <motion.button key={u.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => goDemo(u.id)}
                className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-left hover:bg-muted/40 transition-colors shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: u.dot }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{u.id}</p>
                  <p className="text-[10px] text-muted-foreground">{u.label}</p>
                </div>
              </motion.button>
            ))}
          </div>

          <p className="text-center text-[11px] text-muted-foreground/50 leading-relaxed">
            Demo accounts bypass login · Data is for demonstration only
          </p>
        </motion.div>
      </div>

      {/* ── Reddit username modal ── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="bg-card rounded-2xl border shadow-2xl p-7 w-full max-w-sm space-y-5"
            >
              {/* Modal header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ background: "#FF4500" }}>
                  <RedditIcon size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Continue with Reddit</p>
                  <p className="text-[11px] text-muted-foreground">Enter your Reddit username to sign in</p>
                </div>
              </div>

              {/* Username input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Reddit username
                </label>
                <div
                  className="flex items-center rounded-xl border-2 bg-background px-3 py-2.5 gap-2 transition-all"
                  style={{ borderColor: focused ? "#FF4500" : "var(--border)", boxShadow: focused ? "0 0 0 3px rgba(255,69,0,0.10)" : "none" }}
                >
                  <span className="text-muted-foreground text-sm">u/</span>
                  <input
                    autoFocus
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                    placeholder="your_username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRedditLogin()}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    disabled={loading}
                  />
                </div>
                {error && (
                  <p className="text-xs text-rose-500 mt-1">{error}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleRedditLogin}
                  disabled={loading || !username.trim()}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity"
                  style={{ background: "#FF4500" }}
                >
                  {loading ? "Signing in…" : "Continue"}
                </motion.button>
              </div>

              <p className="text-center text-[10px] text-muted-foreground/50 leading-relaxed">
                This is a simulated login for the demo. No Reddit data is accessed.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
