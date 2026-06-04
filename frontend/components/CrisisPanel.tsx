"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageCircle, Heart, Pencil, HeartHandshake, Check, Phone, Bell } from "lucide-react"
import { api } from "@/lib/api"
import type { NotifyPreviewResponse, SendNotificationResponse } from "@/lib/api"

const HELPLINES = [
  { name: "Tele-MANAS (Govt. of India)", number: "14416", url: null, desc: "Free · 24/7" },
  { name: "AASRA", number: "9820466726", url: "https://aasra.info", desc: "24/7 crisis line" },
  { name: "Vandrevala Foundation", number: "9999666555", url: null, desc: "24/7 helpline" },
]

interface Contact {
  name: string
  contact: string
  notify?: boolean
  details_consent?: boolean
}

interface Props {
  userId: string
  contacts: Contact[]
  compact?: boolean  // no card wrapper / helplines / header — just contact button + modal
  // Bump `nonce` to open the outreach flow at the 3-type "choose" step with a
  // contact preselected (e.g. when a node is tapped in the support-network graph).
  openRequest?: { contact: string; nonce: number } | null
}

type Mode = "check_in" | "with_details" | "custom"
type Step = "prompt" | "choose" | "compose" | "done"

const MODES: { id: Mode; emoji: React.ReactNode; title: string; desc: string; needsConsent: boolean }[] = [
  { id: "check_in", emoji: <MessageCircle className="w-5 h-5" />, title: "Just check in", desc: "A gentle nudge to reach out. Nothing about you is shared.", needsConsent: false },
  { id: "with_details", emoji: <Heart className="w-5 h-5" />, title: "Share how I'm doing", desc: "A short, kind summary of what you're going through.", needsConsent: true },
  { id: "custom", emoji: <Pencil className="w-5 h-5" />, title: "Write my own message", desc: "Send a note to your contacts in your own words.", needsConsent: true },
]

export function CrisisPanel({ userId, contacts, compact = false, openRequest = null }: Props) {
  const notifiable = contacts.filter((c) => c.notify !== false && c.contact)
  const consented = notifiable.filter((c) => c.details_consent)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("prompt")
  const [mode, setMode] = useState<Mode | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<NotifyPreviewResponse | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendNotificationResponse | null>(null)
  const [pendingContact, setPendingContact] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const pendingName = pendingContact ? contacts.find((c) => c.contact === pendingContact)?.name : null

  // Note: the outreach modal no longer auto-opens. The dashboard's SupportPopup is
  // the first thing a Critical user sees; reaching out to contacts is offered there
  // and opened on demand (openFlow) to avoid stacking two modals on entry.

  // Open the flow at the 3-type "choose" step with a contact preselected, when the
  // parent bumps openRequest.nonce (e.g. a tapped node in the support-network graph).
  useEffect(() => {
    if (!openRequest?.nonce) return
    setMode(null); setMessages({}); setPreview(null); setResult(null); setSending(false)
    setPendingContact(openRequest.contact)
    setSelected({ [openRequest.contact]: true })
    setStep("choose")
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce])

  // Accessibility for the outreach modal: focus it on open, trap Tab inside,
  // close on Escape, lock page scroll, and return focus to the opener on close.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close(); return }
      if (e.key !== "Tab") return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  function reset() {
    setStep("prompt"); setMode(null); setSelected({}); setMessages({})
    setPreview(null); setResult(null); setSending(false); setPendingContact(null)
  }
  function close() { setOpen(false); setTimeout(reset, 250) }
  function openFlow() { reset(); setStep("choose"); setOpen(true) }

  async function pickMode(m: Mode) {
    setMode(m)
    // Preserve a contact preselected from the support-network graph; otherwise start fresh.
    setSelected(pendingContact ? { [pendingContact]: true } : {})
    setStep("compose")
    if (m === "with_details" && !preview) {
      setLoadingPreview(true)
      try { setPreview(await api.notifyPreview(userId)) } catch { /* shown generic */ }
      finally { setLoadingPreview(false) }
    }
  }

  const eligible = mode && MODES.find((x) => x.id === mode)?.needsConsent ? consented : notifiable
  const chosen = eligible.filter((c) => selected[c.contact])
  const canSend = chosen.length > 0 && (mode !== "custom" || chosen.every((c) => (messages[c.contact] || "").trim()))

  async function send() {
    if (!mode || !canSend || sending) return
    setSending(true)
    try {
      const payload = chosen.map((c) => ({
        name: c.name,
        contact: c.contact,
        custom_message: mode === "custom" ? messages[c.contact] : undefined,
      }))
      const res = await api.notifySend(userId, mode, payload)
      setResult(res)
      setStep("done")
    } catch {
      // keep the user on the compose step so they can retry
    } finally {
      setSending(false)
    }
  }

  if (compact) {
    return (
      <>
        {notifiable.length > 0 ? (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {notifiable.map((c) => (
                <span key={c.contact} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-[11px] font-medium text-primary">
                  <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold">{c.name[0].toUpperCase()}</span>
                  {c.name}
                </span>
              ))}
            </div>
            <motion.button
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              onClick={openFlow}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
            >
              <Bell className="w-4 h-4" /> Reach out to my contacts
            </motion.button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No contacts with notifications enabled. Add them in Settings.</p>
        )}
        <p className="text-[11px] text-muted-foreground/50 text-center pt-2">
          Immediate danger? Call <strong>112</strong>
        </p>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
              onClick={close}
            >
              <motion.div
                ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
                aria-label="Reach out to your contacts"
                initial={{ scale: 0.96, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl outline-none"
              >
                <div className="h-1" style={{ background: "linear-gradient(90deg, #6d28d9, #8b5cf6)" }} />
                <div className="p-6 space-y-5">
                  {step === "prompt" && (
                    <div className="space-y-4 text-center">
                      <HeartHandshake className="w-10 h-10 mx-auto text-muted-foreground" />
                      <h3 className="text-lg font-semibold text-foreground">You don&apos;t have to be alone in this</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Would you like Penumbra to let one of your contacts know you could use some support? You&apos;ll choose who, and exactly what they see.
                      </p>
                      <div className="flex gap-3 pt-1">
                        <button onClick={close} className="flex-1 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors">Not now</button>
                        <button onClick={() => setStep("choose")} className="flex-[1.4] rounded-xl py-2.5 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}>Yes, reach out</button>
                      </div>
                    </div>
                  )}
                  {step === "choose" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">What would you like to share?</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{pendingName ? `Sending to ${pendingName} · ` : ""}You&apos;re always in control of what leaves Penumbra.</p>
                      </div>
                      <div className="space-y-2">
                        {MODES.map((m) => {
                          const locked = m.needsConsent && consented.length === 0
                          return (
                            <button key={m.id} disabled={locked} onClick={() => pickMode(m.id)}
                              className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors ${locked ? "opacity-50 cursor-not-allowed border-border" : "border-border hover:border-primary/60 hover:bg-primary/[0.04]"}`}>
                              <span className="text-xl leading-none mt-0.5">{m.emoji}</span>
                              <span className="flex-1">
                                <span className="block text-sm font-medium text-foreground">{m.title}</span>
                                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{m.desc}</span>
                                {locked && <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">Needs a contact who has agreed to receive details — set this in Settings.</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <button onClick={close} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                    </div>
                  )}
                  {step === "compose" && mode && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setStep("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                        <h3 className="text-base font-semibold text-foreground flex-1">{MODES.find((x) => x.id === mode)?.title}</h3>
                      </div>
                      {mode === "with_details" && (
                        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview — what they&apos;ll receive</p>
                          {loadingPreview ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                              <span className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                              Writing a gentle summary…
                            </div>
                          ) : (
                            <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed max-h-44 overflow-y-auto">
                              {preview?.body ?? "A short, kind summary of how you've been doing, with no diagnosis."}
                            </pre>
                          )}
                        </div>
                      )}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">
                          {mode === "check_in" ? "Who would you like to nudge?" : "Send to"}
                          {eligible.length > 0 && <span className="text-muted-foreground font-normal"> · pick at least one</span>}
                        </p>
                        {eligible.length === 0 ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                            None of your contacts have agreed to receive details yet.
                          </p>
                        ) : (
                          eligible.map((c) => {
                            const on = !!selected[c.contact]
                            return (
                              <div key={c.contact} className={`rounded-xl border p-3 transition-colors ${on ? "border-primary/60 bg-primary/[0.04]" : "border-border"}`}>
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <input type="checkbox" checked={on} onChange={(e) => setSelected((s) => ({ ...s, [c.contact]: e.target.checked }))} className="accent-primary w-4 h-4" />
                                  <span className="flex-1">
                                    <span className="block text-sm font-medium text-foreground">{c.name}</span>
                                    <span className="block text-[11px] text-muted-foreground">{c.contact}</span>
                                  </span>
                                </label>
                                {mode === "custom" && on && (
                                  <textarea rows={3} value={messages[c.contact] || ""}
                                    onChange={(e) => setMessages((m) => ({ ...m, [c.contact]: e.target.value }))}
                                    placeholder={`Write a message to ${c.name}…`}
                                    className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                      <button onClick={send} disabled={!canSend || sending}
                        className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}>
                        {sending ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Sending…</> : <>Send to {chosen.length || ""} {chosen.length === 1 ? "contact" : "contacts"}</>}
                      </button>
                    </div>
                  )}
                  {step === "done" && result && (
                    <div className="space-y-4 text-center">
                      <Check className="w-10 h-10 mx-auto text-emerald-500" />
                      <h3 className="text-lg font-semibold text-foreground">{result.sent > 0 ? "Your message is on its way" : "Nothing was sent"}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {result.sent > 0 ? `${result.sent} ${result.sent === 1 ? "person has" : "people have"} been gently asked to check in on you.` : "You can try again whenever you're ready."}
                      </p>
                      <div className="space-y-1.5 text-left">
                        {result.results.map((r) => (
                          <div key={r.contact} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                            <span className="text-xs font-medium text-foreground">{r.name}</span>
                            <span className={`text-[11px] font-medium ${r.status === "sent" || r.status === "simulated" ? "text-emerald-600 dark:text-emerald-400" : r.status === "skipped" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {r.status === "sent" ? "Sent" : r.status === "simulated" ? "Queued" : r.status === "skipped" ? (r.reason || "Skipped") : "Failed"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button onClick={close} className="w-full rounded-xl py-2.5 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}>Close</button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl overflow-hidden border border-rose-200/80 dark:border-rose-400/20 backdrop-blur-xl bg-gradient-to-br from-[#fff8f7] to-[#fff5f5] dark:from-[#241318]/95 dark:to-[#1d1116]/95"
    >
      <div className="h-1" style={{ background: "linear-gradient(90deg, #b84040, #c85858, #d4824e)" }} />

      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center flex-shrink-0"><HeartHandshake className="w-5 h-5 text-rose-600 dark:text-rose-400" /></div>
          <div>
            <h3 className="font-semibold text-rose-800 dark:text-rose-200 text-sm">You deserve support right now</h3>
            <p className="text-xs text-rose-600/80 dark:text-rose-300/70 mt-0.5 leading-relaxed">
              Reaching out is a sign of courage. Trained, compassionate professionals are available to listen — for free, right now.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {HELPLINES.map((h) => (
            <motion.div
              key={h.name}
              whileHover={{ x: 2 }}
              className="flex items-center justify-between bg-white/70 dark:bg-white/5 backdrop-blur-sm rounded-xl px-4 py-3 border border-rose-100 dark:border-rose-300/10"
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
                className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100 transition-colors bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 rounded-xl px-3 py-1.5"
              >
                <Phone className="w-4 h-4" />
                {h.number}
              </a>
            </motion.div>
          ))}
        </div>

        {/* Reach-out entry point */}
        {notifiable.length > 0 && (
          <div className="pt-1 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {notifiable.map((c) => (
                <span key={c.contact} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100/80 dark:bg-rose-500/10 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                  <span className="w-4 h-4 rounded-full bg-rose-200 dark:bg-rose-500/20 flex items-center justify-center text-[9px] font-bold">
                    {c.name[0].toUpperCase()}
                  </span>
                  {c.name}
                </span>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              onClick={openFlow}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #b84040, #c85858)" }}
            >
              <Bell className="w-4 h-4" />
              Reach out to my contacts
            </motion.button>
          </div>
        )}

        <p className="text-[11px] text-rose-500/70 dark:text-rose-300/60 text-center">
          If you are in immediate danger, please call <strong>112</strong> · You are not alone
        </p>
      </div>

      {/* ── Outreach flow (modal) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
            onClick={close}
          >
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Reach out to your contacts"
              initial={{ scale: 0.96, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl outline-none"
            >
              <div className="h-1" style={{ background: "linear-gradient(90deg, #b84040, #c85858, #d4824e)" }} />
              <div className="p-6 space-y-5">

                {/* STEP: prompt */}
                {step === "prompt" && (
                  <div className="space-y-4 text-center">
                    <HeartHandshake className="w-10 h-10 mx-auto text-muted-foreground" />
                    <h3 className="text-lg font-semibold text-foreground">This is a hard moment — you don&apos;t have to be alone in it</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Would you like Penumbra to let one of your emergency contacts know you could use some support?
                      You&apos;ll choose who, and exactly what they see.
                    </p>
                    <div className="flex gap-3 pt-1">
                      <button onClick={close}
                        className="flex-1 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors">
                        Not now
                      </button>
                      <button onClick={() => setStep("choose")}
                        className="flex-[1.4] rounded-xl py-2.5 text-sm font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, #b84040, #c85858)" }}>
                        Yes, reach out
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: choose mode */}
                {step === "choose" && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">What would you like to share?</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{pendingName ? `Sending to ${pendingName} · ` : ""}You&apos;re always in control of what leaves Penumbra.</p>
                    </div>
                    <div className="space-y-2">
                      {MODES.map((m) => {
                        const locked = m.needsConsent && consented.length === 0
                        return (
                          <button
                            key={m.id}
                            disabled={locked}
                            onClick={() => pickMode(m.id)}
                            className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                              locked ? "opacity-50 cursor-not-allowed border-border" : "border-border hover:border-primary/60 hover:bg-primary/[0.04]"
                            }`}
                          >
                            <span className="text-xl leading-none mt-0.5">{m.emoji}</span>
                            <span className="flex-1">
                              <span className="block text-sm font-medium text-foreground">{m.title}</span>
                              <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{m.desc}</span>
                              {locked && (
                                <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                  Needs a contact who has agreed to receive details — set this in Settings.
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <button onClick={close} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                  </div>
                )}

                {/* STEP: compose / select recipients */}
                {step === "compose" && mode && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStep("choose")}
                        className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                      <h3 className="text-base font-semibold text-foreground flex-1">
                        {MODES.find((x) => x.id === mode)?.title}
                      </h3>
                    </div>

                    {/* with_details preview */}
                    {mode === "with_details" && (
                      <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview — what they&apos;ll receive</p>
                        {loadingPreview ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                            Writing a gentle summary…
                          </div>
                        ) : (
                          <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed max-h-44 overflow-y-auto">
                            {preview?.body ?? "A short, kind summary of how you've been doing, with no diagnosis."}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* recipient picker */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">
                        {mode === "check_in" ? "Who would you like to nudge?" : "Send to"}
                        {eligible.length > 0 && <span className="text-muted-foreground font-normal"> · pick at least one</span>}
                      </p>

                      {eligible.length === 0 ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                          None of your contacts have agreed to receive details yet. You can enable that per contact in Settings, or send a simple check-in instead.
                        </p>
                      ) : (
                        eligible.map((c) => {
                          const on = !!selected[c.contact]
                          return (
                            <div key={c.contact} className={`rounded-xl border p-3 transition-colors ${on ? "border-primary/60 bg-primary/[0.04]" : "border-border"}`}>
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(e) => setSelected((s) => ({ ...s, [c.contact]: e.target.checked }))}
                                  className="accent-rose-600 w-4 h-4"
                                />
                                <span className="flex-1">
                                  <span className="block text-sm font-medium text-foreground">{c.name}</span>
                                  <span className="block text-[11px] text-muted-foreground">{c.contact}</span>
                                </span>
                              </label>
                              {mode === "custom" && on && (
                                <textarea
                                  rows={3}
                                  value={messages[c.contact] || ""}
                                  onChange={(e) => setMessages((m) => ({ ...m, [c.contact]: e.target.value }))}
                                  placeholder={`Write a message to ${c.name}… e.g. "Hey, I'm having a rough night and could really use a call."`}
                                  className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                />
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>

                    <button
                      onClick={send}
                      disabled={!canSend || sending}
                      className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, #b84040, #c85858)" }}
                    >
                      {sending ? (
                        <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Sending…</>
                      ) : (
                        <>Send to {chosen.length || ""} {chosen.length === 1 ? "contact" : "contacts"}</>
                      )}
                    </button>
                  </div>
                )}

                {/* STEP: done */}
                {step === "done" && result && (
                  <div className="space-y-4 text-center">
                    <Check className="w-10 h-10 mx-auto text-emerald-500" />
                    <h3 className="text-lg font-semibold text-foreground">
                      {result.sent > 0 ? "Your message is on its way" : "Nothing was sent"}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {result.sent > 0
                        ? `${result.sent} ${result.sent === 1 ? "person has" : "people have"} been gently asked to check in on you. Reaching out took courage.`
                        : "No messages went out. You can try again whenever you're ready."}
                    </p>
                    <div className="space-y-1.5 text-left">
                      {result.results.map((r) => (
                        <div key={r.contact} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                          <span className="text-xs font-medium text-foreground">{r.name}</span>
                          <span className={`text-[11px] font-medium ${
                            r.status === "sent" || r.status === "simulated" ? "text-emerald-600 dark:text-emerald-400"
                              : r.status === "skipped" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"
                          }`}>
                            {r.status === "sent" ? "Sent"
                              : r.status === "simulated" ? "Queued"
                              : r.status === "skipped" ? (r.reason || "Skipped") : "Failed"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button onClick={close}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #b84040, #c85858)" }}>
                      Close
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
