/**
 * Firebase Storage — initialization only, no business logic yet.
 * TODO: this app already has its own image upload pipeline through the
 * PHP backend (ImageUploadService — see docs/audit/01-architecture.md
 * §2.9); only add Firebase Storage functions here if a specific feature
 * is deliberately moved onto it instead of the existing backend upload.
 */
import { getStorage } from 'firebase/storage'
import { firebaseApp } from './firebase'

export const firebaseStorage = getStorage(firebaseApp)

// TODO: export the storage functions this app actually needs, e.g.
// uploadFile(), getDownloadUrlFor()
