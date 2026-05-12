"use client"

const COLORS: Record<string, string> = {
  Low:      "bg-teal-50 text-teal-800 border-teal-200",
  Medium:   "bg-amber-50 text-amber-800 border-amber-200",
  High:     "bg-orange-50 text-orange-800 border-orange-200",
  Critical: "bg-rose-50 text-rose-800 border-rose-200",
}

const DOTS: Record<string, string> = {
  Low:      "bg-teal-500",
  Medium:   "bg-amber-500",
  High:     "bg-orange-500",
  Critical: "bg-rose-500",
}

export function SeverityBadge({ severity, score }: { severity: string; score?: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${COLORS[severity] ?? COLORS.Low}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOTS[severity] ?? DOTS.Low}`} />
      {severity}
      {score !== undefined && <span className="opacity-50">({(score * 100).toFixed(0)}%)</span>}
    </span>
  )
}

export function severityColor(severity: string): string {
  return {
    Low:      "#2d9e8e",
    Medium:   "#c49a3c",
    High:     "#c4713c",
    Critical: "#b84040",
  }[severity] ?? "#6b7280"
}
