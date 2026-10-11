import axios from 'axios'
import { env } from '../config/env'

export const api = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/** Centralized error message extractor. */
export function getErrorMessage(err, fallback = 'Something went wrong') {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message || err.response?.data?.error || fallback
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}
