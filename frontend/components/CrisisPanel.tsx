"use client"

import { motion } from "framer-motion"

const HELPLINES = [
  { name: "iCall (TISS)", number: "9152987821", url: "https://icallhelpline.org", desc: "Free & confidential" },
  { name: "Vandrevala Foundation", number: "1860-2662-345", url: null, desc: "24/7 helpline" },
  { name: "Snehi", number: "044-24640050", url: null, desc: "Emotional support" },
]

export function CrisisPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl overflow-hidden border border-rose-200/80"
      style={{ background: "linear-gradient(135deg, #fff8f7 0%, #fff5f5 100%)" }}
    >
      {/* Top accent */}
      <div className="h-1" style={{ background: "linear-gradient(90deg, #b84040, #c85858, #d4824e)" }} />

      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 text-base">🤝</div>
          <div>
            <h3 className="font-semibold text-rose-800 text-sm">You deserve support right now</h3>
            <p className="text-xs text-rose-600/80 mt-0.5 leading-relaxed">
              Reaching out is a sign of courage. Trained, compassionate professionals are available to listen — for free, right now.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {HELPLINES.map((h) => (
            <motion.div
              key={h.name}
              whileHover={{ x: 2 }}
              className="flex items-center justify-between bg-white/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-rose-100"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{h.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[11px] text-muted-foreground">{h.desc}</p>
                  {h.url && (
                    <a href={h.url} target="_blank" rel="noreferrer"
                      className="text-[11px] text-primary hover:underline">{h.url.replace("https://", "")}</a>
                  )}
                </div>
              </div>
              <a
                href={`tel:${h.number.replace(/-/g, "")}`}
                className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:text-rose-900 transition-colors bg-rose-50 hover:bg-rose-100 rounded-xl px-3 py-1.5"
              >
                <span className="text-base">📞</span>
                {h.number}
              </a>
            </motion.div>
          ))}
        </div>

        <p className="text-[11px] text-rose-500/70 text-center">
          If you are in immediate danger, please call <strong>112</strong> · You are not alone
        </p>
      </div>
    </motion.div>
  )
}
