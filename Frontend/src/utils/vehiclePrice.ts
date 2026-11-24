import type { TFunction } from 'i18next'

export function formatVehicleDailyRate(rate: string | number, t?: TFunction, language?: string): string {
  const amount = typeof rate === 'number' ? rate : Number(rate)
  if (String(rate).trim() === '' || !Number.isFinite(amount)) {
    return t ? t('public.tarif_indisponible') : 'Tarif indisponible'
  }

  const formatted = new Intl.NumberFormat(language ?? 'fr-BE', { maximumFractionDigits: 2 }).format(amount)
  const value = formatted + ' €'
  return t ? t('public.rate_jour', { rate: value }) : value + ' / jour'
}
