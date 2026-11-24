import type { TFunction } from 'i18next'

const labels: Record<string, string> = {
  MANUAL: 'public.manuelle',
  MANUEL: 'public.manuelle',
  MANUELLE: 'public.manuelle',
  AUTOMATIC: 'public.automatique',
  AUTOMATIQUE: 'public.automatique',
  PETROL: 'public.essence',
  GASOLINE: 'public.essence',
  ESSENCE: 'public.essence',
  DIESEL: 'public.diesel',
  ELECTRIC: 'public.electrique',
  ÉLECTRIQUE: 'public.electrique',
  HYBRID: 'public.hybride',
  HYBRIDE: 'public.hybride',
}

export function vehicleDisplayLabel(t: TFunction, value: string) {
  const key = labels[value.toUpperCase()]
  return key ? t(key) : value
}
