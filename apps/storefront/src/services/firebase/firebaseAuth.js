/**
 * Firebase Auth — initialization only, no business logic yet.
 *
 * Note: customer Google sign-in already works today through Google
 * Identity Services directly (see pages/customer/Login.jsx) posting to
 * the backend's own /customers/google-login — that is NOT Firebase Auth
 * and should keep working as-is. Only add Firebase Auth functions here
 * for a feature deliberately built on it later.
 *
 * TODO: implement the actual auth functions needed, each as a named
 * export that takes plain arguments and returns a plain result — never
 * export raw Firebase SDK objects from here.
 */
import { getAuth } from 'firebase/auth'
import { firebaseApp } from './firebase'

export const firebaseAuth = getAuth(firebaseApp)
