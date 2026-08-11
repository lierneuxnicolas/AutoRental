import type {
  MechanicInterventionCompleteRequest,
  MechanicInterventionPhotoResponse,
  MechanicInterventionPhotoUploadRequest,
  MechanicInterventionResponse,
  MechanicInterventionStartRequest,
  MechanicInterventionListQueryParams,
  PaginatedMechanicInterventionListResponse,
} from '../types/mechanicIntervention'
import {
  completeIntervention,
  getInterventionById,
  getInterventions,
  startIntervention,
  uploadInterventionPhoto,
} from './workerInterventionService'

export async function getMechanicInterventions(
  params?: MechanicInterventionListQueryParams,
): Promise<PaginatedMechanicInterventionListResponse> {
  return getInterventions('mechanic', params)
}

export async function getMechanicInterventionById(id: number): Promise<MechanicInterventionResponse> {
  return getInterventionById('mechanic', id)
}

export async function startMechanicIntervention(
  id: number,
  payload?: MechanicInterventionStartRequest,
): Promise<MechanicInterventionResponse> {
  void payload
  return startIntervention('mechanic', id)
}

export async function uploadMechanicInterventionPhoto(
  id: number,
  payload: MechanicInterventionPhotoUploadRequest,
): Promise<MechanicInterventionPhotoResponse> {
  return uploadInterventionPhoto('mechanic', id, payload)
}

export async function completeMechanicIntervention(
  id: number,
  payload: MechanicInterventionCompleteRequest,
): Promise<MechanicInterventionResponse> {
  return completeIntervention('mechanic', id, payload)
}
