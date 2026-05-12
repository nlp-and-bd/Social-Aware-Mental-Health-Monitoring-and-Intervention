"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChatInterface } from "@/components/ChatInterface"

const QUICK_STARTS = [
  "Evaluate my mental state based on my recent posts",
  "What patterns do you see in my posts?",
  "I just need someone to talk to right now",
]

export function FloatingChat({
  userId,
  onEvaluate,
}: {
  userId: string
  onEvaluate?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="rounded-2xl border bg-card shadow-2xl overflow-hidden flex flex-col"
            style={{
              width: 380,
              height: 540,
              transformOrigin: "bottom right",
              boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px var(--border)",
            }}
          >
            {/* Panel header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-card"
              style={{ background: "linear-gradient(135deg, #1a1035 0%, #120d24 100%)" }}>
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0">
                <img src="/logo.png" alt="Penumbra" style={{ width: "20px", height: "20px" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white leading-none">Penumbra AI</p>
                <p className="text-[10px] text-white/50 mt-0.5">Listening, not advising</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Chat body */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatInterface
                userId={userId}
                onEvaluate={onEvaluate}
                quickStartOptions={QUICK_STARTS}
                compact
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        className="w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center relative"
        style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
        title="Chat with Penumbra AI"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.svg
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-5 h-5"
              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </motion.svg>
          ) : (
            <motion.svg
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-5 h-5"
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </motion.svg>
          )}
        </AnimatePresence>

        {/* Subtle pulse ring when closed */}
        {!open && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ background: "rgba(139,92,246,0.3)" }}
            animate={{ scale: [1, 1.5, 1.5], opacity: [0.6, 0, 0] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeOut" }}
          />
        )}
      </motion.button>
    </div>
  )
}
