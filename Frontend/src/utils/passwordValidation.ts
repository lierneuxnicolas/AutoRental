import { z } from 'zod'

export const minimumPasswordLength = 15

export function countPasswordCharacters(value: string) {
  return [...value].length
}

export function createPasswordSchema(lengthError: string, characterError: string) {
  return z.string()
    .refine((value) => {
      const length = countPasswordCharacters(value)
      return length >= minimumPasswordLength && length <= 128
    }, lengthError)
    .refine(
      (value) => !/^[\p{White_Space}]+$/u.test(value) && !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(value),
      characterError,
    )
}

export const newPasswordSchema = createPasswordSchema(
  'Le mot de passe doit contenir entre 15 et 128 caractères.',
  'Le mot de passe contient un caractère non autorisé.',
)
