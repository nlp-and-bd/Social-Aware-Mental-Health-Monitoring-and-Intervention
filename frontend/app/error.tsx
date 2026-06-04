"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { ServerOff, AlertTriangle } from "lucide-react"

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const isBackendDown = error.message.includes("backend") || error.message.includes("fetch") || error.message.includes("Failed to fetch")

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md space-y-5"
      >
        <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
          {isBackendDown ? <ServerOff className="w-8 h-8 text-muted-foreground" /> : <AlertTriangle className="w-8 h-8 text-amber-500" />}
        </div>
        <div>
          <h2 className="text-2xl text-foreground mb-2">
            {isBackendDown ? "Backend not reachable" : "Something went wrong"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isBackendDown
              ? "Make sure the FastAPI server is running on port 8002. Run uvicorn backend.main:app --reload --reload-dir backend --port 8002 in your terminal."
              : error.message}
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-xl px-6 py-2.5 text-sm font-medium text-white"
          style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
        >
          Try again
        </button>
      </motion.div>
    </div>
  )
}
