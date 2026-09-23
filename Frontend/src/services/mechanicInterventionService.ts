import type {
  MechanicInterventionCompleteRequest,
  MechanicInterventionCheckInValues,
  MechanicInterventionCheckOutValues,
  MechanicInterventionPhotoResponse,
  MechanicInterventionPhotoUploadRequest,
  MechanicInterventionResponse,
  MechanicInterventionStartRequest,
  MechanicInterventionWorkValues,
  MechanicInterventionListQueryParams,
  PaginatedMechanicInterventionListResponse,
} from '../types/mechanicIntervention'
import {
  completeIntervention,
  checkInIntervention,
  checkOutIntervention,
  getInterventionById,
  getInterventions,
  interruptIntervention,
  saveInterventionWork,
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

export async function checkInMechanicIntervention(
  id: number,
  payload: MechanicInterventionCheckInValues,
): Promise<MechanicInterventionResponse> {
  return checkInIntervention('mechanic', id, payload)
}

export async function interruptMechanicIntervention(
  id: number,
  payload: Parameters<typeof interruptIntervention>[2],
): Promise<MechanicInterventionResponse> {
  return interruptIntervention('mechanic', id, payload)
}

export async function uploadMechanicInterventionPhoto(
  id: number,
  payload: MechanicInterventionPhotoUploadRequest,
): Promise<MechanicInterventionPhotoResponse> {
  return uploadInterventionPhoto('mechanic', id, payload)
}

export async function saveMechanicInterventionWork(
  id: number,
  payload: MechanicInterventionWorkValues,
): Promise<MechanicInterventionResponse> {
  return saveInterventionWork('mechanic', id, payload)
}

export async function checkOutMechanicIntervention(
  id: number,
  payload: MechanicInterventionCheckOutValues,
): Promise<MechanicInterventionResponse> {
  return checkOutIntervention('mechanic', id, payload)
}

export async function completeMechanicIntervention(
  id: number,
  payload: MechanicInterventionCompleteRequest,
): Promise<MechanicInterventionResponse> {
  return completeIntervention('mechanic', id, payload)
}
