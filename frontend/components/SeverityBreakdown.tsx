"use client"

import { motion } from "framer-motion"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import type { PostSeverityResult } from "@/lib/api"

const SEV_COLOR: Record<string, string> = {
  Low:      "#2d9e8e",
  Medium:   "#c49a3c",
  High:     "#c4713c",
  Critical: "#b84040",
}

const SEV_BG: Record<string, string> = {
  Low:      "rgba(45,158,142,0.10)",
  Medium:   "rgba(196,154,60,0.10)",
  High:     "rgba(196,113,60,0.10)",
  Critical: "rgba(184,64,64,0.10)",
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="bg-card border rounded-xl px-3.5 py-2.5 shadow-lg text-xs space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: SEV_COLOR[name] }} />
        <span className="font-semibold text-foreground">{name}</span>
      </div>
      <p className="text-muted-foreground">{value} post{value !== 1 ? "s" : ""}</p>
    </div>
  )
}

export function SeverityBreakdown({ results }: { results: PostSeverityResult[] }) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-2xl">📊</div>
        <p className="text-sm text-muted-foreground">No posts classified yet.</p>
      </div>
    )
  }

  // Count per severity
  const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 }
  results.forEach((r) => { counts[r.severity] = (counts[r.severity] ?? 0) + 1 })
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))

  const total = results.length
  const dominant = data.reduce((a, b) => (b.value > a.value ? b : a), data[0])

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-6">
        {/* Donut chart */}
        <div className="flex-shrink-0 relative" style={{ width: 200, height: 200 }}>
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={SEV_COLOR[entry.name]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label — absolutely centred over the donut hole */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-2xl font-bold text-foreground">{total}</p>
            <p className="text-[10px] text-muted-foreground">posts</p>
          </div>
        </div>

        {/* Stats breakdown */}
        <div className="flex-1 grid grid-cols-2 gap-2.5 pt-2">
          {["Low", "Medium", "High", "Critical"].map((sev, i) => (
            <motion.div
              key={sev}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-xl p-3 border"
              style={{ background: SEV_BG[sev] }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: SEV_COLOR[sev] }} />
                  <span className="text-xs font-medium text-foreground">{sev}</span>
                </div>
                <span className="text-base font-bold text-foreground">{counts[sev] ?? 0}</span>
              </div>
              {/* Mini bar */}
              <div className="h-1.5 rounded-full bg-white/50 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: SEV_COLOR[sev] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${total > 0 ? ((counts[sev] ?? 0) / total) * 100 : 0}%` }}
                  transition={{ duration: 0.8, delay: 0.3 + i * 0.07, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {total > 0 ? Math.round(((counts[sev] ?? 0) / total) * 100) : 0}% of posts
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Dominant severity note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border/40">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEV_COLOR[dominant.name] }} />
        Most posts classified as <strong className="text-foreground">{dominant.name}</strong> ({dominant.value} of {total})
      </div>
    </div>
  )
}
