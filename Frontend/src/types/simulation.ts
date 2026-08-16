export interface PriceSimulationRequest {
  vehicle_id: number
  start_at: string
  end_at: string
  insurance_type?: 'STANDARD' | 'DUO' | 'OMNIUM'
  reservation_id?: number
}

export interface PriceSimulationResponse {
  vehicle_id: number
  duration_hours: string | number
  rental_amount: string | number
  insurance_type: string
  insurance_amount: string | number
  deposit_amount: string | number
  insurance_included: boolean
  total_amount: string | number
}
