"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Calendar } from "lucide-react"
import type { PostSeverityResult } from "@/lib/api"

const SEV_ORDER = ["Low", "Medium", "High", "Critical"]
const SEV_COLOR: Record<string, string> = {
  Low:      "#2d9e8e",
  Medium:   "#9c7a2e",
  High:     "#c4713c",
  Critical: "#b84040",
}

function worstSeverity(sevs: string[]): string {
  return sevs.reduce(
    (worst, s) => SEV_ORDER.indexOf(s) > SEV_ORDER.indexOf(worst) ? s : worst,
    "Low"
  )
}

interface DayData { date: string; count: number; severity: string; posts: string[] }

export function ActivityHeatmap({ results }: { results: PostSeverityResult[] }) {
  const [hovered, setHovered] = useState<DayData | null>(null)

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center"><Calendar className="w-6 h-6 text-muted-foreground" /></div>
        <p className="text-sm text-muted-foreground">No posts classified yet.</p>
      </div>
    )
  }

  // Build a map of date → posts
  const byDate: Record<string, { count: number; severities: string[]; snippets: string[] }> = {}
  results.forEach((r) => {
    const date = r.post_id.split("_")[1] ?? r.timestamp.slice(0, 10)
    if (!byDate[date]) byDate[date] = { count: 0, severities: [], snippets: [] }
    byDate[date].count++
    byDate[date].severities.push(r.severity)
    byDate[date].snippets.push(r.text_snippet.slice(0, 60))
  })

  // Build a 12-week grid ending today
  const today = new Date()
  const weeks: DayData[][] = []
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 83)
  startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7))

  let current = new Date(startDate)
  for (let w = 0; w < 12; w++) {
    const week: DayData[] = []
    for (let d = 0; d < 7; d++) {
      const key = current.toISOString().slice(0, 10)
      const info = byDate[key]
      week.push({
        date: key,
        count: info?.count ?? 0,
        severity: info ? worstSeverity(info.severities) : "none",
        posts: info?.snippets ?? [],
      })
      current = new Date(current)
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  const DAYS = ["Mon", "", "Wed", "", "Fri", "", "Sun"]

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {/* Day labels */}
        <div className="flex flex-col gap-1 pt-5 pr-1">
          {DAYS.map((d, i) => (
            <div key={i} className="h-4 flex items-center text-[10px] text-muted-foreground w-6 leading-none">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          {/* Month labels */}
          <div className="flex gap-1 mb-1 ml-0.5">
            {weeks.map((week, wi) => {
              const firstOfMonth = week.find(d => d.date.slice(8) === "01")
              return (
                <div key={wi} className="w-4 text-[10px] text-muted-foreground">
                  {firstOfMonth ? new Date(firstOfMonth.date).toLocaleString("default", { month: "short" }) : ""}
                </div>
              )
            })}
          </div>

          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => {
                  const isFuture = new Date(day.date) > today
                  const isEmpty = day.count === 0 || isFuture
                  const color = isEmpty ? "var(--muted)" : SEV_COLOR[day.severity]
                  const opacity = isEmpty ? 1 : Math.min(0.4 + day.count * 0.3, 1)
                  const label = isEmpty ? undefined
                    : `${day.count} post${day.count !== 1 ? "s" : ""}, ${day.severity} severity, ${new Date(day.date).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`

                  return (
                    <motion.button
                      key={di}
                      type="button"
                      disabled={isEmpty}
                      aria-label={label}
                      className={`w-4 h-4 rounded-sm ${isEmpty ? "cursor-default" : "cursor-pointer"}`}
                      style={{ background: color, opacity: isFuture ? 0.2 : opacity }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: (wi * 7 + di) * 0.003, duration: 0.15 }}
                      onMouseEnter={() => !isEmpty && setHovered(day)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => !isEmpty && setHovered(day)}
                      onBlur={() => setHovered(null)}
                      onClick={() => !isEmpty && setHovered((h) => (h?.date === day.date ? null : day))}
                      whileHover={!isEmpty ? { scale: 1.4 } : {}}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border bg-card px-4 py-3 shadow-md text-xs space-y-1.5"
        >
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: SEV_COLOR[hovered.severity] }} />
            <span className="font-semibold text-foreground">
              {new Date(hovered.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span className="ml-auto text-muted-foreground">{hovered.count} post{hovered.count !== 1 ? "s" : ""} · {hovered.severity}</span>
          </div>
          {hovered.posts.map((p, i) => (
            <p key={i} className="text-muted-foreground pl-4 border-l border-border">"{p}…"</p>
          ))}
        </motion.div>
      )}

      {/* Legend — each colour is paired with its label so severity is never
          conveyed by colour alone (colourblind users + touch with no hover). */}
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2">
        <span className="text-[10px] text-muted-foreground">Tap or hover a cell to see posts</span>
        <div className="flex items-center gap-3 flex-wrap">
          {["Low", "Medium", "High", "Critical"].map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <span className="w-3 h-3 rounded-sm" style={{ background: SEV_COLOR[s] }} />
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
