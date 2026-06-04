"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Inbox } from "lucide-react"
import { SeverityBadge } from "@/components/SeverityBadge"
import type { PostSeverityResult } from "@/lib/api"

const SEV_BORDER: Record<string, string> = {
  Low: "#2d9e8e", Medium: "#9c7a2e", High: "#c4713c", Critical: "#b84040",
}
const SEV_BG: Record<string, string> = {
  Low: "rgba(45,158,142,0.04)", Medium: "rgba(156,122,46,0.04)",
  High: "rgba(196,113,60,0.04)", Critical: "rgba(184,64,64,0.05)",
}

// Fall back to parsing the post_id ("uXXX_YYYY-MM-DD_subreddit") when the
// backend didn't supply explicit subreddit/date fields.
function subredditOf(r: PostSeverityResult): string {
  return r.subreddit || r.post_id.split("_")[2] || "unknown"
}
function dateOf(r: PostSeverityResult): string {
  return r.date || r.post_id.split("_")[1] || ""
}

function PostModal({ post, onClose }: { post: PostSeverityResult; onClose: () => void }) {
  const accent = SEV_BORDER[post.severity] ?? "#6b7280"
  const dateStr = dateOf(post)
  const parsed = dateStr ? new Date(dateStr) : null
  const pretty = parsed && !isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "Date unknown"

  const dialogRef = useRef<HTMLDivElement>(null)

  // Accessibility: focus the dialog on open, trap Tab inside it, close on
  // Escape, restore focus to the card that opened it, and lock page scroll.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return }
      if (e.key !== "Tab") return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
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
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-modal-title"
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-2xl border shadow-2xl w-full max-w-lg overflow-hidden outline-none"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b">
          <div className="min-w-0">
            <p id="post-modal-title" className="text-sm font-semibold text-foreground">r/{subredditOf(post)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{pretty}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SeverityBadge severity={post.severity} score={post.confidence} />
            <button
              onClick={onClose}
              className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Full post text */}
        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {post.text || post.text_snippet}
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            Classified as
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: accent }} aria-hidden="true" />
              {post.severity}
            </span>
            {" · "}{Math.round(post.confidence * 100)}% confidence
          </span>
          <button
            onClick={onClose}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function PostList({ results }: { results: PostSeverityResult[] }) {
  const [selected, setSelected] = useState<PostSeverityResult | null>(null)

  if (results.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 gap-3"
      >
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center"><Inbox className="w-6 h-6 text-muted-foreground" /></div>
        <p className="text-sm text-muted-foreground">No posts classified yet.</p>
        <p className="text-xs text-muted-foreground/60">Posts appear here once analysis runs.</p>
      </motion.div>
    )
  }

  return (
    <>
      <AnimatePresence>
        {selected && <PostModal post={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>

      <div className="space-y-2.5">
        {results.map((r, i) => (
          <motion.button
            key={r.post_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.07)" }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setSelected(r)}
            className="w-full text-left rounded-2xl border overflow-hidden transition-shadow duration-200 cursor-pointer"
            style={{
              borderLeftWidth: 3,
              borderLeftColor: SEV_BORDER[r.severity] ?? "#6b7280",
              background: SEV_BG[r.severity] ?? "transparent",
            }}
          >
            <div className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <p className="text-sm text-foreground leading-relaxed flex-1">
                  {r.text_snippet}{r.text_snippet.length >= 120 ? "…" : ""}
                </p>
                <SeverityBadge severity={r.severity} score={r.confidence} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                  r/{subredditOf(r)}
                </span>
                <span className="text-[11px] text-muted-foreground/60">{dateOf(r)}</span>
                <span className="ml-auto text-[11px] text-primary/70 font-medium">Read more →</span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </>
  )
}
