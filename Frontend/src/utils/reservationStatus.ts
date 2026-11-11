import type { StatusVariant } from '../components/ui/StatusBadge'

// Single source of truth so client and manager reservation lists show identical labels and colors.
export function getReservationStatusUi(
  status: string | undefined,
  cancellationSource?: string | null,
): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'CONFIRMEE':
      return { label: 'Confirmée', variant: 'success' }
    case 'REAFFECTATION_REQUIRED':
      return { label: 'À réaffecter', variant: 'warning' }
    case 'EN_COURS':
      return { label: 'En cours', variant: 'info' }
    case 'A_CONTROLER':
      return { label: 'À contrôler', variant: 'warning' }
    case 'TERMINEE':
      return { label: 'Terminée', variant: 'success' }
    case 'NON_UTILISEE':
      return { label: 'Non utilisée', variant: 'neutral' }
    case 'ANNULEE':
      if (cancellationSource === 'GESTIONNAIRE') return { label: 'Annulée par le gestionnaire', variant: 'danger' }
      return { label: 'Annulée par le client', variant: 'danger' }
    default:
      return { label: 'Non confirmée', variant: 'neutral' }
  }
}
