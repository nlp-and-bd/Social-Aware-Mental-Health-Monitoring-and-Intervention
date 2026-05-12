"use client"

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts"
import { motion } from "framer-motion"

interface HistoryEntry { label: string; score: number; timestamp: string }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const score = payload[0].value
  const severity = score < 30 ? "Low" : score < 55 ? "Medium" : score < 75 ? "High" : "Critical"
  const colors: Record<string, string> = { Low: "#2d9e8e", Medium: "#c49a3c", High: "#c4713c", Critical: "#b84040" }
  return (
    <div className="bg-card border rounded-xl px-3.5 py-2.5 shadow-lg text-xs space-y-1">
      <p className="text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: colors[severity] }} />
        <span className="font-semibold text-foreground">{score}% — {severity}</span>
      </div>
    </div>
  )
}

export function SeverityTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-48 gap-3"
      >
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-2xl">📈</div>
        <p className="text-sm text-muted-foreground">No history yet — run classify to begin.</p>
      </motion.div>
    )
  }

  const data = history.map((h) => ({
    date: new Date(h.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    score: Math.round(h.score * 100),
  }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 12, right: 16, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2d9e8e" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2d9e8e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false} tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine y={30} stroke="#2d9e8e" strokeDasharray="5 4" strokeOpacity={0.5}
            label={{ value: "Low", position: "right", fontSize: 10, fill: "#2d9e8e" }} />
          <ReferenceLine y={55} stroke="#c49a3c" strokeDasharray="5 4" strokeOpacity={0.5}
            label={{ value: "Medium", position: "right", fontSize: 10, fill: "#c49a3c" }} />
          <ReferenceLine y={75} stroke="#c4713c" strokeDasharray="5 4" strokeOpacity={0.5}
            label={{ value: "High", position: "right", fontSize: 10, fill: "#c4713c" }} />

          <Area
            type="monotone"
            dataKey="score"
            stroke="#2d9e8e"
            strokeWidth={2.5}
            fill="url(#scoreGrad)"
            dot={{ r: 4, fill: "#2d9e8e", strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 6, fill: "#2d9e8e", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
