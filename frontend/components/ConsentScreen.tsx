"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle } from "lucide-react"

interface Contact {
  name: string
  contact: string
  notify: boolean
  details_consent: boolean
}

interface Props {
  userId: string
  onComplete: (username: string, displayName: string, contacts: Contact[]) => void
}

function defaultContact(): Contact {
  return { name: "", contact: "", notify: true, details_consent: false }
}

export function ConsentScreen({ userId, onComplete }: Props) {
  const [username, setUsername] = useState(userId)
  const [displayName, setDisplayName] = useState("")
  const [contacts, setContacts] = useState<Contact[]>([defaultContact()])
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  function updateField<K extends keyof Contact>(i: number, field: K, value: Contact[K]) {
    setContacts((c) => c.map((x, j) => (j === i ? { ...x, [field]: value } : x)))
  }

  function submit() {
    const valid = contacts.filter((c) => c.name.trim() && c.contact.trim())
    onComplete(username, displayName.trim(), valid)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-5/12 flex-col justify-center p-14 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0d0a1a 0%, #120d24 50%, #1a1035 100%)" }}>
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-8">
            <img src="/logo_with_name.png" alt="Penumbra" style={{ height: "50px", width: "auto" }} />
          </div>
          <h1 className="text-4xl leading-snug text-white">
            Your wellbeing,<br />your terms.
          </h1>
          <p className="text-white/70 leading-relaxed">
            We're here to listen and support — not to judge, diagnose, or replace professional care.
          </p>
          <div className="space-y-3 pt-2">
            {[
              "Your data is never shared without consent",
              "Emergency contacts only notified in critical situations",
              "You choose exactly what they receive",
              "Update or remove settings anytime",
            ].map((t) => (
              <div key={t} className="flex items-start gap-3 text-white/80 text-sm">
                <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s <= step ? "bg-primary w-8" : "bg-muted w-4"
                }`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">Step {step} of 2</span>
          </div>

          {step === 1 ? (
            <>
              <div>
                <h2 className="text-3xl text-foreground mb-1">Before we begin</h2>
                <p className="text-muted-foreground text-sm">A few important things to know</p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-3">
                <p className="font-semibold text-amber-800 dark:text-amber-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> This is not a therapy service</p>
                <ul className="space-y-2">
                  {[
                    "For early awareness and peer support only",
                    "Does not replace a qualified mental health professional",
                    "Your Reddit posts will be analysed for distress patterns",
                    "Chosen contacts may be prompted to check in on you in a crisis",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                      <span className="mt-0.5 flex-shrink-0">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Your name</label>
                <input
                  className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 shadow-sm"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex"
                />
                <p className="text-xs text-muted-foreground">
                  Shown across your dashboard, and used to introduce you to your contacts. Your Reddit handle is never shared with them.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Your Reddit username</label>
                <input
                  className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 shadow-sm"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl border bg-card hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-indigo-600"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span className="text-sm text-muted-foreground leading-relaxed">
                  I understand this is not a medical service. I consent to my posts being analysed and my emergency contacts being notified only in a critical situation.
                </span>
              </label>

              <button
                onClick={() => setStep(2)}
                disabled={!agreed || !username.trim() || !displayName.trim()}
                className="w-full bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground rounded-xl py-3 font-medium text-sm transition-opacity shadow-sm"
              >
                Continue →
              </button>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-3xl text-foreground mb-1">Emergency contacts</h2>
                <p className="text-muted-foreground text-sm">
                  Optional — only contacted if your distress reaches Critical. You choose what they receive.
                </p>
              </div>

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {contacts.map((c, i) => (
                  <div key={i} className="rounded-xl border bg-card p-3 space-y-3">
                    {/* Name + contact + remove */}
                    <div className="flex gap-2 items-center">
                      <input
                        className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 shadow-sm"
                        placeholder="Name"
                        value={c.name}
                        onChange={(e) => updateField(i, "name", e.target.value)}
                      />
                      <input
                        className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 shadow-sm"
                        placeholder="Email or phone"
                        value={c.contact}
                        onChange={(e) => updateField(i, "contact", e.target.value)}
                      />
                      {contacts.length > 1 && (
                        <button
                          onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Notify toggle */}
                    <div className="flex items-center justify-between px-0.5">
                      <div>
                        <p className="text-xs font-medium text-foreground">Include in crisis outreach</p>
                        <p className="text-xs text-muted-foreground">Offer this person as an option if you reach out</p>
                      </div>
                      <button
                        onClick={() => updateField(i, "notify", !c.notify)}
                        className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${c.notify ? "bg-primary" : "bg-muted-foreground/30"}`}
                      >
                        <div className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${c.notify ? "translate-x-[18px]" : "translate-x-0"}`} />
                      </button>
                    </div>

                    {/* Details consent (only when notify=true) */}
                    <AnimatePresence>
                      {c.notify && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-0.5 pt-0.5">
                            <div className="pr-3">
                              <p className="text-xs font-medium text-foreground">Ask permission to share details</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                We'll email them a confirmation link. Only after they agree can you share how you're doing or a personal note.
                              </p>
                            </div>
                            <button
                              onClick={() => updateField(i, "details_consent", !c.details_consent)}
                              className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${c.details_consent ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                            >
                              <div className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${c.details_consent ? "translate-x-[18px]" : "translate-x-0"}`} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {contacts.length < 3 && (
                <button
                  onClick={() => setContacts((c) => [...c, defaultContact()])}
                  className="text-xs text-primary hover:underline"
                >
                  + Add another contact
                </button>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border rounded-xl py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={submit}
                  className="flex-[2] bg-primary hover:opacity-90 text-primary-foreground rounded-xl py-3 font-medium text-sm transition-opacity shadow-sm"
                >
                  Continue to Dashboard
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
