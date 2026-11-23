import axios from 'axios'
import { useId, useRef, useState, type FormEvent } from 'react'
import { requestAccountErasure } from '../../services/authService'
import { clearSession, readSession, withSessionLock } from '../../services/authSession'
import { accountErasureErrorMessage, accountErasureOutcome, ERASURE_CONFIRMATION_KEY } from '../../utils/accountErasureResult'
import Button from '../ui/Button'
import Input from '../ui/Input'

export default function AccountErasureAction() {
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (pending.current) return
    const password = new FormData(form).get('password')
    if (typeof password !== 'string' || password.length === 0) return

    pending.current = true
    const version = readSession().version
    setIsSubmitting(true)
    setError('')
    form.reset()
    try {
      const outcome = accountErasureOutcome(await requestAccountErasure(password))
      if (outcome.completed) {
        dialog.current?.close()
        const clearClosedSession = () => {
          if (readSession().version !== version) return
          window.sessionStorage.setItem(ERASURE_CONFIRMATION_KEY, '1')
          clearSession()
          window.location.replace('/')
        }
        // The server already revoked the session. Clear it locally and notify the other tabs.
        if (navigator.locks) {
          await withSessionLock(async () => clearClosedSession())
        } else {
          clearClosedSession()
        }
      } else {
        setNotice(outcome.message)
        dialog.current?.close()
      }
    } catch (requestError) {
      if (axios.isCancel(requestError)) return
      const expired = axios.isAxiosError(requestError) && requestError.response?.status === 401
      if (expired && !readSession().access) {
        window.location.replace('/login?session=erasure-expired')
      } else {
        const response = axios.isAxiosError<{ password?: string[]; detail?: string }>(requestError)
          ? requestError.response
          : undefined
        const detail = response?.status === 400 ? response.data?.password?.[0] : response?.data?.detail
        setError(accountErasureErrorMessage(response?.status, detail, axios.isAxiosError(requestError) ? requestError.code : undefined))
      }
    } finally {
      pending.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-slate-200 pt-1.5">
      {notice ? <p role="status" className="text-sm text-slate-700">{notice}</p> : null}
      <Button
        variant="danger"
        size="sm"
        className="mx-auto flex! w-11/12 bg-[#F52200]! hover:bg-[#F52200]! focus-visible:ring-[#F52200]!"
        aria-haspopup="dialog"
        onClick={() => {
          setError('')
          dialog.current?.showModal()
        }}
      >
        Supprimer mon compte
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6"
        onCancel={(event) => {
          if (pending.current) event.preventDefault()
          else event.currentTarget.querySelector('form')?.reset()
        }}
      >
        <form className="space-y-4" onSubmit={submit} aria-busy={isSubmitting}>
          <h2 id={titleId} className="text-xl font-semibold">Supprimer mon compte</h2>
          <p id={descriptionId} className="text-sm text-slate-700">
            Cette action désactivera votre compte et entraînera l'effacement des données personnelles qui ne doivent plus être conservées légalement.
          </p>
          <Input label="Mot de passe actuel" type="password" name="password" autoComplete="current-password" required disabled={isSubmitting} />
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={isSubmitting} onClick={(event) => {
              event.currentTarget.form?.reset()
              dialog.current?.close()
            }}>
              Annuler
            </Button>
            <Button type="submit" variant="danger" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi en cours…' : 'Confirmer la suppression'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
