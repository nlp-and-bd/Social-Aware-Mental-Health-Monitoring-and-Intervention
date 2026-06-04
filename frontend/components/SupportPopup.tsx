"use client"

import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { HeartHandshake, Phone, Bell, X } from "lucide-react"

type Helpline = { name: string; number: string | null; url: string | null }

// Fallback if evaluate() returned no helplines for some reason — Critical-tier lines.
const FALLBACK_HELPLINES: Helpline[] = [
  { name: "Tele-MANAS (Govt. of India)", number: "14416", url: null },
  { name: "AASRA", number: "9820466726", url: "https://aasra.info" },
  { name: "Vandrevala Foundation", number: "9999666555", url: null },
]

interface Props {
  open: boolean
  displayName?: string
  helplines?: Helpline[]
  hasContacts: boolean
  onReachOut: () => void
  onClose: () => void
}

/**
 * A gentle, full-screen "you deserve support" card shown the first time a user
 * is seen at Critical severity in a session — whether they were already Critical
 * at sign-in or new posts just pushed them there. It leads with warmth and
 * helplines; reaching out to personal contacts is offered, never forced.
 */
export function SupportPopup({ open, displayName, helplines, hasContacts, onReachOut, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const lines = helplines && helplines.length > 0 ? helplines : FALLBACK_HELPLINES

  // Focus the dialog on open, trap Tab, close on Escape, lock page scroll,
  // and return focus to the previously-focused element on close.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return }
      if (e.key !== "Tab") return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-popup-title"
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-rose-200/80 dark:border-rose-400/20 shadow-2xl outline-none bg-gradient-to-br from-[#fff8f7] to-[#fff5f5] dark:from-[#241318] dark:to-[#1d1116]"
          >
            <div className="h-1.5" style={{ background: "linear-gradient(90deg, #b84040, #c85858, #d4824e)" }} />

            {/* Dismiss */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full flex items-center justify-center text-rose-500/70 hover:text-rose-700 hover:bg-rose-100/70 dark:hover:bg-rose-500/15 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
                  className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center"
                >
                  <HeartHandshake className="w-7 h-7 text-rose-600 dark:text-rose-400" />
                </motion.div>
                <h2 id="support-popup-title" className="text-xl font-semibold text-rose-800 dark:text-rose-200">
                  {displayName ? `${displayName}, you deserve support` : "You deserve support"}
                </h2>
                <p className="text-sm text-rose-600/90 dark:text-rose-300/80 leading-relaxed">
                  Things look really heavy right now. Reaching out is a sign of courage, not weakness —
                  and you don&apos;t have to carry this alone. Trained, compassionate people are ready to
                  listen, free and right now.
                </p>
              </div>

              {/* Helplines */}
              <div className="space-y-2">
                {lines.map((h) => (
                  <motion.div
                    key={h.name}
                    whileHover={{ x: 2 }}
                    className="flex items-center justify-between gap-3 bg-white/70 dark:bg-white/5 backdrop-blur-sm rounded-xl px-4 py-3 border border-rose-100 dark:border-rose-300/10"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{h.name}</p>
                      {h.url && (
                        <a href={h.url} target="_blank" rel="noreferrer"
                          className="text-[11px] text-primary hover:underline">
                          {h.url.replace("https://", "")}
                        </a>
                      )}
                    </div>
                    {h.number && (
                      <a
                        href={`tel:${h.number.replace(/-/g, "")}`}
                        className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100 transition-colors bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-xl px-3 py-1.5 flex-shrink-0"
                      >
                        <Phone className="w-4 h-4" />
                        {h.number}
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2.5 pt-1">
                <motion.button
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  onClick={onReachOut}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #b84040, #c85858)" }}
                >
                  <Bell className="w-4 h-4" />
                  {hasContacts ? "Reach out to someone I trust" : "See my support options"}
                </motion.button>
                <button
                  onClick={onClose}
                  className="w-full rounded-xl border border-rose-200/70 dark:border-rose-400/20 py-2.5 text-sm font-medium text-rose-700/90 dark:text-rose-300/80 hover:bg-rose-100/50 dark:hover:bg-rose-500/10 transition-colors"
                >
                  I&apos;m okay for now
                </button>
              </div>

              <p className="text-[11px] text-rose-500/70 dark:text-rose-300/60 text-center">
                If you are in immediate danger, please call <strong>112</strong> · You are not alone
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
