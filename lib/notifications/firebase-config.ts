export const firebaseClientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
}

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    firebaseClientConfig.apiKey &&
      firebaseClientConfig.projectId &&
      firebaseClientConfig.messagingSenderId &&
      firebaseClientConfig.appId &&
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  )
}
