import i18next, { type TFunction } from 'i18next'
import fr from './fr.json'

const sections = ['public', 'auth', 'navigation', 'client'] as const

function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('’', "'").toLowerCase()
}

const displayKeys = new Map<string, string>(
  sections.flatMap((section) => Object.entries(fr[section])
    .map(([key, label]) => [normalizeLabel(label), section + '.' + key])),
)

const reservationMessages = [
  [/^Votre reservation (.+) est confirmee\.$/, 'client.votre_reservation_reference_est_confirmee'],
  [/^Le paiement Stripe de votre reservation (.+) a ete annule\.$/, 'client.le_paiement_stripe_de_votre_reservation_reference_a_ete_annule'],
] as const

export function clientApiErrorKey(code: unknown): string | null {
  if (typeof code !== 'string') return null
  const key = 'api_' + code.toLowerCase()
  return Object.hasOwn(fr.client, key) ? 'client.' + key : null
}

export function clientDisplay(t: TFunction, value: string): string {
  if (value.startsWith('client.api_')) return t(value)
  const key = displayKeys.get(normalizeLabel(value))
  if (key) return t(key)
  for (const [pattern, messageKey] of reservationMessages) {
    const reference = pattern.exec(value)?.[1]
    if (reference) return t(messageKey, { reference })
  }
  return value
}

export function clientLocale(): string {
  switch (i18next.resolvedLanguage) {
    case 'nl': return 'nl-BE'
    case 'en': return 'en-GB'
    default: return 'fr-FR'
  }
}

export function stripeLocale(): 'fr' | 'nl' | 'en' {
  const language = i18next.resolvedLanguage
  return language === 'nl' || language === 'en' ? language : 'fr'
}
