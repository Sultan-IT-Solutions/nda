import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimeWithGMT5(dateString: string | Date): string {
  try {
    const date = new Date(dateString)

    const gmt5Date = new Date(date.getTime() + (5 * 60 * 60 * 1000))
    return gmt5Date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    })
  } catch {
    return typeof dateString === 'string' ? dateString : dateString.toString()
  }
}

export function formatDateWithGMT5(dateString: string | Date): string {
  try {
    const date = new Date(dateString)

    const gmt5Date = new Date(date.getTime() + (5 * 60 * 60 * 1000))
    return gmt5Date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC'
    })
  } catch {
    return typeof dateString === 'string' ? dateString : dateString.toString()
  }
}

export function formatDateTimeWithGMT5(dateString: string | Date): string {
  try {
    const date = new Date(dateString)

    const gmt5Date = new Date(date.getTime() + (5 * 60 * 60 * 1000))
    return gmt5Date.toLocaleString('ru-RU', {
      hour12: false,
      timeZone: 'UTC'
    })
  } catch {
    return typeof dateString === 'string' ? dateString : dateString.toString()
  }
}

export function convertTimeToGMT5ISO(date: string, time: string): string {
  try {

    const dateTime = new Date(`${date}T${time}:00`)

    const utcDateTime = new Date(dateTime.getTime() - (5 * 60 * 60 * 1000))
    return utcDateTime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}
