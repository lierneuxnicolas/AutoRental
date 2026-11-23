interface ErasureResult {
  httpStatus: number
  status: string
  processing_status: string
  reason_detail?: string
  detail?: string
}

export const ERASURE_CONFIRMATION_KEY = 'getacar:account-erasure-completed'

export function accountErasureOutcome(result: ErasureResult) {
  if (result.httpStatus === 200 && result.status === 'CLOSED' && result.processing_status === 'COMPLETED') {
    return { completed: true, message: '' }
  }
  if (result.status === 'CLOSED') {
    return { completed: false, message: result.detail || 'Votre compte est clôturé. L’effacement reste en attente.' }
  }
  if (result.httpStatus === 202 && result.status === 'PENDING') {
    return {
      completed: false,
      message: 'Votre demande est enregistrée. La clôture est différée. '
        + (result.reason_detail || result.detail || 'Une opération est encore en cours.'),
    }
  }
  return { completed: false, message: 'Le serveur n’a pas confirmé l’état de la demande de suppression.' }
}

export function accountErasureErrorMessage(status?: number, detail?: string, networkCode?: string) {
  switch (status) {
    case 400: return detail || 'Le mot de passe actuel est incorrect. Vérifiez votre saisie.'
    case 401: return 'Votre session a expiré. Reconnectez-vous avant de réessayer.'
    case 403: return 'Votre session ne permet pas de demander la suppression de ce compte.'
    case 404: return 'La suppression de compte est indisponible sur ce serveur. Contactez GetaCar.'
    case 429: return 'Trop de tentatives. Patientez avant de réessayer.'
    case 503: return detail || 'Le service de suppression est temporairement indisponible.'
    default:
      if (networkCode === 'ECONNABORTED' || networkCode === 'ETIMEDOUT') {
        return 'Le serveur n’a pas répondu à temps. Le résultat de la demande reste inconnu.'
      }
      if (!status) return 'Impossible de joindre le serveur. Vérifiez votre connexion.'
      return 'Le serveur a rencontré une erreur pendant la suppression du compte. Contactez GetaCar.'
  }
}
