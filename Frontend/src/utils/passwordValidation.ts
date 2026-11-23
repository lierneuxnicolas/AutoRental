import { z } from 'zod'

export const minimumPasswordLength = 15

export function countPasswordCharacters(value: string) {
  return [...value].length
}

export const newPasswordSchema = z.string()
  .refine((value) => {
    const length = countPasswordCharacters(value)
    return length >= minimumPasswordLength && length <= 128
  }, 'Le mot de passe doit contenir entre 15 et 128 caractères.')
  .refine(
    (value) => !/^[\p{White_Space}]+$/u.test(value) && !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(value),
    'Le mot de passe contient un caractère non autorisé.',
  )
