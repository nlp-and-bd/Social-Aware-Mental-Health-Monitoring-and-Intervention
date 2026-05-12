"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { api, type ChatResponse } from "@/lib/api"
import { CrisisPanel } from "@/components/CrisisPanel"

interface Message {
  role: "user" | "assistant"
  content: string
  sources?: string[]
  crisis?: boolean
}

function Sources({ sources }: { sources: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>›</motion.span>
        {sources.length} source{sources.length > 1 ? "s" : ""} used
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1 pt-1.5">
              {sources.map((s) => (
                <span key={s} className="text-[10px] bg-primary/8 text-primary/80 border border-primary/15 rounded-full px-2 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const WELCOME: Message = {
  role: "assistant",
  content: "Hi, I'm here with you. This is a safe, private space to share what's on your mind. I'm not a therapist, but I'll listen and try to help you find the right support. How are you feeling today?",
}

const DEFAULT_QUICK_STARTS = [
  "Evaluate my mental state based on my posts",
  "What do my recent posts say about how I'm feeling?",
  "I just need someone to talk to",
]

export function ChatInterface({
  userId, onEvaluate, quickStartOptions, compact,
}: {
  userId: string
  onEvaluate?: () => void
  quickStartOptions?: string[]
  compact?: boolean
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyCount, setHistoryCount] = useState(0)
  const [sessionUserCount, setSessionUserCount] = useState(0)
  const [convId, setConvId] = useState<string | undefined>()
  const [focused, setFocused] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const quickStarts = quickStartOptions ?? DEFAULT_QUICK_STARTS

  // Load past conversation history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await api.chatHistory(userId)
        if (res.history.length > 0) {
          const past: Message[] = res.history.map((h) => ({
            role: h.role as "user" | "assistant",
            content: h.content,
          }))
          setMessages([WELCOME, ...past])
          setHistoryCount(past.length)
        }
      } catch {
        // No history or user not found — keep welcome message only
      } finally {
        setHistoryLoading(false)
      }
    }
    loadHistory()
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setInput("")
    setSessionUserCount((n) => n + 1)
    setMessages((m) => [...m, { role: "user", content: text }])
    setLoading(true)
    try {
      const res: ChatResponse = await api.chat(userId, text, convId)
      setConvId(res.conversation_id)
      setMessages((m) => [...m, {
        role: "assistant", content: res.reply,
        sources: res.sources, crisis: res.crisis_detected,
      }])
      if (onEvaluate) onEvaluate()
    } catch {
      setMessages((m) => [...m, {
        role: "assistant",
        content: "I'm having a little trouble responding right now. If you need immediate support, please contact iCall at 9152987821.",
      }])
    } finally {
      setLoading(false)
    }
  }

  const showQuickStarts = sessionUserCount === 0 && !historyLoading

  return (
    <div className="flex flex-col rounded-b-2xl overflow-hidden" style={{ height: compact ? "100%" : 560 }}>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        style={{ background: "linear-gradient(180deg, var(--background) 0%, var(--card) 100%)" }}>

        {historyLoading && (
          <div className="flex justify-center py-8">
            <div className="flex gap-1.5">
              {[0,1,2].map((i) => (
                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, delay: i * 0.2, duration: 0.7 }} />
              ))}
            </div>
          </div>
        )}

        {!historyLoading && historyCount > 0 && (
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border/60" />
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Past conversations</span>
            <div className="flex-1 h-px bg-border/60" />
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {/* New session divider — inserted before first message of current session */}
            {historyCount > 0 && i === historyCount + 1 && (
              <div className="flex items-center gap-3 py-2 mb-2">
                <div className="flex-1 h-px bg-primary/20" />
                <span className="text-[10px] text-primary/60 uppercase tracking-widest">New session</span>
                <div className="flex-1 h-px bg-primary/20" />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 overflow-hidden p-0.5">
                  <img src="/logo.png" alt="Penumbra" style={{ width: "20px", height: "20px" }} />
                </div>
              )}
              <div className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"} max-w-[75%]`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                    msg.role === "user"
                      ? "rounded-br-md text-white"
                      : "rounded-bl-md bg-card border text-foreground"
                  }`}
                  style={msg.role === "user" ? { background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" } : {}}
                >
                  {msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && <Sources sources={msg.sources} />}
                {msg.crisis && <div className="w-full mt-1"><CrisisPanel /></div>}
              </div>
            </motion.div>
          </div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2.5"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden p-0.5">
                <img src="/logo.png" alt="Penumbra" style={{ width: "20px", height: "20px" }} />
              </div>
              <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-2 h-2 rounded-full bg-muted-foreground/40 block"
                    animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, delay: i * 0.18, duration: 0.7, ease: "easeInOut" }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Quick-start chips */}
      <AnimatePresence>
        {showQuickStarts && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="px-4 py-3 border-t bg-muted/20 flex flex-col gap-2"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Quick start</p>
            <div className="flex flex-col gap-1.5">
              {quickStarts.map((q, i) => (
                <motion.button
                  key={q}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => send(q)}
                  disabled={loading}
                  className="text-left text-xs text-foreground/80 hover:text-foreground bg-card hover:bg-muted/60 border border-border/60 hover:border-primary/30 rounded-xl px-3.5 py-2.5 transition-all disabled:opacity-40"
                >
                  {q}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="border-t bg-card px-4 py-3">
        <div
          className="flex items-center gap-2.5 rounded-2xl border-2 bg-background px-4 py-2 transition-all duration-200"
          style={{ borderColor: focused ? "#7c3aed" : "var(--border)", boxShadow: focused ? "0 0 0 3px rgba(124,58,237,0.10)" : "none" }}
        >
          <input
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50 py-1"
            placeholder="Share what's on your mind…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={loading}
          />
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 transition-opacity"
            style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
          Not a crisis service · If in danger call 112 · iCall: 9152987821
        </p>
      </div>
    </div>
  )
}
