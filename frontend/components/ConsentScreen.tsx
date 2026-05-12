"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"

interface Contact { name: string; contact: string }
interface Props {
  userId: string
  onComplete: (username: string, contacts: Contact[]) => void
}

export function ConsentScreen({ userId, onComplete }: Props) {
  const [username, setUsername] = useState(userId)
  const [contacts, setContacts] = useState<Contact[]>([{ name: "", contact: "" }])
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  function updateContact(i: number, field: "name" | "contact", value: string) {
    setContacts((c) => c.map((x, j) => (j === i ? { ...x, [field]: value } : x)))
  }

  function submit() {
    const valid = contacts.filter((c) => c.name.trim() && c.contact.trim())
    onComplete(username, valid)
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
              "You can update or remove your settings anytime",
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
                <p className="font-semibold text-amber-800 dark:text-amber-400 text-sm">⚠️ This is not a therapy service</p>
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
                <label className="text-sm font-medium">Your display name</label>
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
                disabled={!agreed || !username.trim()}
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
                  Optional — these people receive a gentle check-in prompt if your distress reaches a critical level. They won't see your data.
                </p>
              </div>

              <div className="space-y-3">
                {contacts.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      className="flex-1 rounded-xl border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 shadow-sm"
                      placeholder="Name"
                      value={c.name}
                      onChange={(e) => updateContact(i, "name", e.target.value)}
                    />
                    <input
                      className="flex-1 rounded-xl border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 shadow-sm"
                      placeholder="Email or phone"
                      value={c.contact}
                      onChange={(e) => updateContact(i, "contact", e.target.value)}
                    />
                    {contacts.length > 1 && (
                      <button
                        onClick={() => setContacts((c) => c.filter((_, j) => j !== i))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {contacts.length < 3 && (
                  <button
                    onClick={() => setContacts((c) => [...c, { name: "", contact: "" }])}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add another contact
                  </button>
                )}
              </div>

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
