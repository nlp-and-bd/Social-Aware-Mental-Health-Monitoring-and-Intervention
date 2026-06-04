"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { UserProfile } from "@/lib/api"

type ConsentStatus = "none" | "pending" | "granted"

interface Contact {
  name: string
  contact: string
  notify: boolean
  details_consent: boolean
  consent_status: ConsentStatus
}

interface Props {
  user: UserProfile
  onContactsUpdated: (contacts: UserProfile["emergency_contacts"], displayName: string) => void
  onPostsCleared: () => void
  onAccountDeleted: () => void
}

function ConfirmDialog({ message, onConfirm, onCancel, danger }: {
  message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card rounded-2xl border shadow-xl p-6 max-w-sm w-full space-y-4"
      >
        <p className="text-sm text-foreground leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-xl border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 ${danger ? "bg-rose-600" : "bg-primary"}`}>
            Confirm
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function defaultContact(): Contact {
  return { name: "", contact: "", notify: true, details_consent: false, consent_status: "none" }
}

function hydrateContact(raw: { name: string; contact: string; notify?: boolean; details_consent?: boolean; consent_status?: ConsentStatus }): Contact {
  const status: ConsentStatus = raw.consent_status ?? (raw.details_consent ? "granted" : "none")
  return {
    name: raw.name,
    contact: raw.contact,
    notify: raw.notify ?? true,
    // On the toggle, "on" means the user wants details shared — i.e. consent is
    // either already granted or has been requested (pending).
    details_consent: status !== "none",
    consent_status: status,
  }
}

export function SettingsPanel({ user, onContactsUpdated, onPostsCleared, onAccountDeleted }: Props) {
  const [displayName, setDisplayName] = useState(user.display_name?.trim() || "")
  const [contacts, setContacts] = useState<Contact[]>(
    user.emergency_contacts.length > 0
      ? user.emergency_contacts.map(hydrateContact)
      : [defaultContact()]
  )
  const [savingContacts, setSavingContacts] = useState(false)
  const [confirm, setConfirm] = useState<"posts" | "account" | null>(null)
  const [busy, setBusy] = useState(false)

  function updateField<K extends keyof Contact>(i: number, field: K, value: Contact[K]) {
    setContacts((c) => c.map((x, j) => j === i ? { ...x, [field]: value } : x))
  }

  function addContact() {
    if (contacts.length < 3) setContacts((c) => [...c, defaultContact()])
  }

  function removeContact(i: number) {
    setContacts((c) => c.filter((_, j) => j !== i))
  }

  function isValidContact(contact: string): boolean {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRe = /^[\d\s\-\+\(\)]{7,15}$/
    return emailRe.test(contact.trim()) || phoneRe.test(contact.trim())
  }

  async function saveContacts() {
    setSavingContacts(true)
    const valid = contacts.filter((c) => c.name.trim() && c.contact.trim())
    const invalid = valid.filter((c) => !isValidContact(c.contact))
    if (invalid.length > 0) {
      toast.error(`Invalid contact for "${invalid[0].name}" — enter a valid email or phone number.`)
      setSavingContacts(false)
      return
    }
    try {
      await api.updateContacts(
        user.user_id,
        valid.map((c) => ({
          name: c.name,
          contact: c.contact,
          notify: c.notify,
          details_consent: c.details_consent,
          email_type: "check_in",
        })),
        displayName.trim() || undefined,
      )
      // Re-fetch so per-contact consent status (pending/granted) is accurate.
      const fresh = await api.graphUser(user.user_id)
      setContacts(fresh.emergency_contacts.length > 0 ? fresh.emergency_contacts.map(hydrateContact) : [defaultContact()])
      onContactsUpdated(fresh.emergency_contacts, fresh.display_name?.trim() || "")
      const requested = valid.filter((c) => c.details_consent && c.contact.includes("@")).length
      toast.success(
        requested > 0
          ? "Saved. We've emailed a confirmation request to contacts you asked to share details with."
          : "Emergency contacts updated"
      )
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally { setSavingContacts(false) }
  }

  async function clearPosts() {
    setBusy(true)
    try {
      await api.clearPosts(user.user_id)
      onPostsCleared()
      toast.success("Post history cleared")
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally { setBusy(false); setConfirm(null) }
  }

  async function deleteAccount() {
    setBusy(true)
    try {
      await api.deleteAccount(user.user_id)
      toast.success("Account deleted")
      onAccountDeleted()
    } catch (e: unknown) {
      toast.error((e as Error).message)
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <>
      <AnimatePresence>
        {confirm === "posts" && (
          <ConfirmDialog
            message="This will permanently delete all your classified posts and reset your severity history. Your chat history will be kept. Are you sure?"
            onConfirm={clearPosts}
            onCancel={() => setConfirm(null)}
            danger
          />
        )}
        {confirm === "account" && (
          <ConfirmDialog
            message="This will permanently delete your account, all posts, and all data. This cannot be undone. Are you sure?"
            onConfirm={deleteAccount}
            onCancel={() => setConfirm(null)}
            danger
          />
        )}
      </AnimatePresence>

      <div className="max-w-xl mx-auto w-full space-y-5">

        {/* Your profile */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Your name</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shown across your dashboard and used when introducing you to your contacts. Your Reddit handle (<span className="font-medium">u/{user.username}</span>) is never shared with them. Saved with your contacts below.
            </p>
          </div>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. Alex"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {/* Emergency contacts */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Emergency contacts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contacted only if you choose to reach out in a crisis. You decide who, and exactly what they receive, at that moment.
            </p>
          </div>

          <div className="space-y-3">
            {contacts.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border bg-background p-3 space-y-3"
              >
                {/* Name + contact + remove */}
                <div className="flex gap-2 items-center">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {i + 1}
                  </div>
                  <input
                    className="flex-1 rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => updateField(i, "name", e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Email or phone"
                    value={c.contact}
                    onChange={(e) => updateField(i, "contact", e.target.value)}
                  />
                  <button
                    onClick={() => removeContact(i)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex-shrink-0"
                  >
                    ×
                  </button>
                </div>

                {/* Notify toggle */}
                <div className="flex items-center justify-between px-1">
                  <div>
                    <p className="text-xs font-medium text-foreground">Include in crisis outreach</p>
                    <p className="text-xs text-muted-foreground">Show this person as an option when you reach out</p>
                  </div>
                  <button
                    onClick={() => updateField(i, "notify", !c.notify)}
                    className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${c.notify ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <div className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${c.notify ? "translate-x-[18px]" : "translate-x-0"}`} />
                  </button>
                </div>

                {/* Details-sharing permission — an explicit request the CONTACT must
                    approve. Never a toggle: the user can only ask; the badge reflects
                    the contact's own confirmation. (Only shown when notify=true.) */}
                <AnimatePresence>
                  {c.notify && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">Sharing personal details</p>
                          {c.consent_status === "granted" ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Confirmed</span>
                          ) : c.consent_status === "pending" ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Awaiting confirmation</span>
                          ) : c.details_consent ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Request queued</span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Check-in only</span>
                          )}
                        </div>

                        {c.consent_status === "granted" ? (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {c.name.trim() || "They"}{" "} approved. When you reach out you can include how you&apos;re doing or a personal note.
                            </p>
                            <button onClick={() => updateField(i, "details_consent", false)}
                              className="text-[11px] font-medium text-rose-600 hover:underline flex-shrink-0">Revoke</button>
                          </div>
                        ) : c.consent_status === "pending" ? (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              We&apos;ve emailed {c.name.trim() || "them"} a confirmation link. Until they approve, they only receive a generic check-in.
                            </p>
                            <button onClick={() => updateField(i, "details_consent", false)}
                              className="text-[11px] font-medium text-rose-600 hover:underline flex-shrink-0">Cancel</button>
                          </div>
                        ) : c.details_consent ? (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              We&apos;ll email {c.name.trim() || "them"} a confirmation link when you save. Details stay locked until they approve.
                            </p>
                            <button onClick={() => updateField(i, "details_consent", false)}
                              className="text-[11px] font-medium text-muted-foreground hover:underline flex-shrink-0">Undo</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              By default they only get a generic check-in. Ask permission to be able to share how you&apos;re doing.
                            </p>
                            <button onClick={() => updateField(i, "details_consent", true)}
                              className="text-[11px] font-semibold text-primary hover:underline flex-shrink-0 whitespace-nowrap">Request permission</button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            {contacts.length < 3 ? (
              <button onClick={addContact} className="text-xs text-primary hover:underline">
                + Add contact
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Maximum 3 contacts</span>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={saveContacts} disabled={savingContacts}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)" }}
            >
              {savingContacts ? "Saving…" : "Save contacts"}
            </motion.button>
          </div>
        </div>

        {/* Data management */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Data management</h3>

          <div className="flex items-start justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
            <div>
              <p className="text-sm font-medium text-foreground">Clear post history</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Removes all classified posts and resets your severity score. Chat history is kept.
              </p>
            </div>
            <button
              onClick={() => setConfirm("posts")} disabled={busy}
              className="ml-4 flex-shrink-0 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-300 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
              Clear posts
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 dark:border-rose-400/20 dark:bg-rose-950/25 p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">Danger zone</h3>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently deletes your account, all posts, severity history, and chat history. Cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setConfirm("account")} disabled={busy}
              className="ml-4 flex-shrink-0 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Delete account
            </button>
          </div>
        </div>

      </div>
    </>
  )
}
