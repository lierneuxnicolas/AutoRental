const dailyRateFormatter = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 })

export function formatVehicleDailyRate(rate: string | number): string {
  const amount = typeof rate === 'number' ? rate : Number(rate)
  if (String(rate).trim() === '' || !Number.isFinite(amount)) {
    return 'Tarif indisponible'
  }

  return `${dailyRateFormatter.format(amount)} € / jour`
}
