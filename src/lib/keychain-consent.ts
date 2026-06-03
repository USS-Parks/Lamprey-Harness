// SEC-10: shared renderer-side gate for any UI that persists a credential
// to the keychain. Returns true when the keychain will accept the write
// (either because safeStorage is available, or because the user accepted
// the plaintext confirm dialog and the main-process session-consent flag
// has been set).
//
// Callers must NOT call `window.api.settings.save*Key` paths without first
// awaiting this helper and acting on its return value — main-process
// `setKey` now throws `PlaintextConsentRequiredError` if it's bypassed
// when encryption is unavailable.

const PLAINTEXT_CONSENT_PROMPT =
  'Encryption is unavailable on this system. Your key will be stored as ' +
  'plaintext on disk (userData/keys.json). Once you grant consent it ' +
  'applies for the rest of this Lamprey session. Continue?'

export async function ensurePlaintextConsentIfNeeded(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.api) {
    // Renderer in browser-dev mode (no Electron). Nothing to gate against
    // because no IPC will fire either.
    return true
  }
  const enc = await window.api.settings.isEncryptionAvailable()
  if (enc.success && enc.data === true) return true

  // Encryption is unavailable (or the IPC failed). Check whether this
  // session has already recorded consent — in which case the user has
  // already accepted the dialog once, and the keychain will accept the
  // write without us re-prompting.
  const prior = await window.api.settings.hasPlaintextConsent()
  if (prior.success && prior.data === true) return true

  const ok = window.confirm(PLAINTEXT_CONSENT_PROMPT)
  if (!ok) return false

  const grant = await window.api.settings.grantPlaintextConsent()
  return grant.success
}
