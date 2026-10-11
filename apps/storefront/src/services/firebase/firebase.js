/**
 * Firebase app singleton. Import `firebaseApp` from here wherever a
 * Firebase SDK needs an app instance — never call initializeApp()
 * anywhere else, so a page re-render or HMR reload can never double-init.
 */
import { getApps, initializeApp } from 'firebase/app'
import { firebaseConfig } from '../../config/firebaseConfig'

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
