const FIXED_START_HOUR = 10
const SAME_DAY_LEAD_MINUTES = 15
const SAME_DAY_STEP_MINUTES = 5

const pad = (value: number) => `${value}`.padStart(2, '0')

function brusselsParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) }
}

export function toDateValue(value: Date): string {
  return brusselsParts(value).date
}

// Same-day start: now + lead time, rounded up, so it is never in the past when sent to the backend.
function getSameDayStart(now: Date): Date {
  const minutes = Math.ceil((now.getTime() + SAME_DAY_LEAD_MINUTES * 60000) / (SAME_DAY_STEP_MINUTES * 60000))
  const candidate = new Date(minutes * SAME_DAY_STEP_MINUTES * 60000)
  if (toDateValue(candidate) === toDateValue(now)) {
    return candidate
  }
  const local = brusselsParts(now)
  const lastMinute = new Date(now.getTime() + ((23 - local.hour) * 60 + (59 - local.minute)) * 60000)
  lastMinute.setSeconds(0, 0)
  if (lastMinute > now) {
    return lastMinute
  }
  const immediate = new Date(Math.ceil((now.getTime() + 10000) / 1000) * 1000)
  return toDateValue(immediate) === toDateValue(now) ? immediate : candidate
}

export function getMinimumStartDate(now: Date = new Date()): string {
  if (brusselsParts(now).hour >= FIXED_START_HOUR) {
    const sameDayStart = getSameDayStart(now)
    if (toDateValue(sameDayStart) === toDateValue(now)) {
      return toDateValue(now)
    }
    return getFollowingDate(toDateValue(now))
  }
  return toDateValue(now)
}

export function getFollowingDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

export function getRentalClock(startDate: string, now: Date = new Date()): string {
  if (startDate === toDateValue(now) && brusselsParts(now).hour >= FIXED_START_HOUR) {
    const start = getSameDayStart(now)
    if (toDateValue(start) === startDate) {
      const local = brusselsParts(start)
      return `${pad(local.hour)}:${pad(local.minute)}:${pad(start.getUTCSeconds())}`
    }
  }
  return `${pad(FIXED_START_HOUR)}:00:00`
}

export function buildRentalDateTime(date: string, clock: string): string {
  const local = `${date}T${clock}`
  const offset = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(`${local}Z`)).find((part) => part.type === 'timeZoneName')?.value
  const match = offset?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/)
  if (!match) {
    throw new Error('Impossible de déterminer le fuseau horaire de Bruxelles.')
  }
  return `${local}${match[1]}${pad(Number(match[2]))}:${match[3] ?? '00'}`
}

export const RETURN_CLOCK = '10:00:00'
