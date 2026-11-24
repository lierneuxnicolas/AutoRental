import type { TFunction } from 'i18next'
import fr from './fr.json'

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('’', "'").toLowerCase()
}

const sections = ['navigation', 'public', 'auth', 'client', 'professional'] as const
const keys = new Map<string, string>()
for (const section of sections) {
  for (const [key, value] of Object.entries(fr[section])) {
    if (!value.includes('{{')) keys.set(normalize(value), section + '.' + key)
  }
}

export function professionalDisplay(t: TFunction, value: string): string {
  const key = keys.get(normalize(value))
  return key ? t(key) : value
}
