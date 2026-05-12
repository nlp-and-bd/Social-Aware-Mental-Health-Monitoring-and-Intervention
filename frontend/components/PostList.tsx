"use client"

import { motion } from "framer-motion"
import { SeverityBadge } from "@/components/SeverityBadge"
import type { PostSeverityResult } from "@/lib/api"

const SEV_BORDER: Record<string, string> = {
  Low: "#2d9e8e", Medium: "#c49a3c", High: "#c4713c", Critical: "#b84040",
}
const SEV_BG: Record<string, string> = {
  Low: "rgba(45,158,142,0.04)", Medium: "rgba(196,154,60,0.04)",
  High: "rgba(196,113,60,0.04)", Critical: "rgba(184,64,64,0.05)",
}

export function PostList({ results }: { results: PostSeverityResult[] }) {
  if (results.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 gap-3"
      >
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-2xl">📭</div>
        <p className="text-sm text-muted-foreground">No posts classified yet.</p>
        <p className="text-xs text-muted-foreground/60">Click "Load & Classify" to begin analysis.</p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-2.5">
      {results.map((r, i) => (
        <motion.div
          key={r.post_id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
          whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.07)" }}
          className="rounded-2xl border overflow-hidden transition-shadow duration-200 cursor-default"
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
                r/{r.post_id.split("_")[2]}
              </span>
              <span className="text-[11px] text-muted-foreground/60">{r.post_id.split("_")[1]}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
