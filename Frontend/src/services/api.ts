import axios, { AxiosHeaders } from 'axios'

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken')

  if (accessToken) {
    const headers = config.headers ?? new AxiosHeaders()
    headers.set('Authorization', `Bearer ${accessToken}`)
    config.headers = headers
  }

  return config
})

export default api
