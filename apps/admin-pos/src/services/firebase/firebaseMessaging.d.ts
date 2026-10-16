export function requestNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'>
export function getDeviceToken(): Promise<string | null>
export function onForegroundMessage(callback: (payload: unknown) => void): Promise<(() => void) | null>
