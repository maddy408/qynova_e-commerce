/**
 * Firebase Auth — initialization only, no business logic yet.
 * TODO: implement the actual auth functions this app needs (e.g. a
 * Firebase-backed staff login alternative/2FA), each as a named export
 * that takes plain arguments and returns a plain result — never export
 * raw Firebase SDK objects from here.
 */
import { getAuth } from 'firebase/auth'
import { firebaseApp } from './firebase'

export const firebaseAuth = getAuth(firebaseApp)

// TODO: export the auth functions this app actually needs, e.g.
// signInWithFirebase(), signOutFromFirebase(), onFirebaseAuthStateChanged()
