"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { UserProfile } from "@/lib/api"

interface Contact { name: string; contact: string }

interface Props {
  user: UserProfile
  onContactsUpdated: (contacts: Contact[]) => void
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

export function SettingsPanel({ user, onContactsUpdated, onPostsCleared, onAccountDeleted }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(
    user.emergency_contacts.length > 0 ? user.emergency_contacts : [{ name: "", contact: "" }]
  )
  const [savingContacts, setSavingContacts] = useState(false)
  const [confirm, setConfirm] = useState<"posts" | "account" | null>(null)
  const [busy, setBusy] = useState(false)

  function updateContact(i: number, field: "name" | "contact", value: string) {
    setContacts((c) => c.map((x, j) => j === i ? { ...x, [field]: value } : x))
  }

  function addContact() {
    if (contacts.length < 3) setContacts((c) => [...c, { name: "", contact: "" }])
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
      await api.updateContacts(user.user_id, valid)
      onContactsUpdated(valid)
      toast.success("Emergency contacts updated")
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

        {/* Emergency contacts */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Emergency contacts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              These people receive a gentle check-in prompt if your distress reaches Critical. They never see your data.
            </p>
          </div>

          <div className="space-y-2.5">
            {contacts.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex gap-2 items-center"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {i + 1}
                </div>
                <input
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateContact(i, "name", e.target.value)}
                />
                <input
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Email or phone"
                  value={c.contact}
                  onChange={(e) => updateContact(i, "contact", e.target.value)}
                />
                <button
                  onClick={() => removeContact(i)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0"
                >
                  ×
                </button>
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
              className="ml-4 flex-shrink-0 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
              Clear posts
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-rose-700">Danger zone</h3>

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
