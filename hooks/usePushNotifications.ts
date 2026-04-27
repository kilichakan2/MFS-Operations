/**
 * hooks/usePushNotifications.ts
 *
 * Manages Web Push subscription lifecycle.
 * Handles permission request, subscription, and storage.
 *
 * Usage on HACCP homepage:
 *   const { permission, subscribe, subscribed } = usePushNotifications()
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

interface UsePushNotificationsResult {
  permission:  PermissionState
  subscribed:  boolean
  supported:   boolean
  subscribe:   () => Promise<boolean>
  unsubscribe: () => Promise<void>
}

// Convert VAPID base64 public key to Uint8Array for subscription
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  const output   = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export function usePushNotifications(): UsePushNotificationsResult {
  const [permission,  setPermission]  = useState<PermissionState>('default')
  const [subscribed,  setSubscribed]  = useState(false)
  const [supported,   setSupported]   = useState(false)

  useEffect(() => {
    // Check if Web Push is supported (requires service worker + PushManager)
    const isSupported = typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    setSupported(isSupported)

    if (!isSupported) return

    setPermission(Notification.permission as PermissionState)

    // Register service worker and check existing subscription
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        const existing = await registration.pushManager.getSubscription()
        setSubscribed(!!existing)
      })
      .catch((err) => console.warn('[usePushNotifications] SW registration failed:', err))
  }, [])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false

    try {
      // Request notification permission
      const result = await Notification.requestPermission()
      setPermission(result as PermissionState)
      if (result !== 'granted') return false

      // Fetch VAPID public key from server
      const keyRes = await fetch('/api/notifications/vapid-key')
      if (!keyRes.ok) throw new Error('Failed to fetch VAPID key')
      const { publicKey } = await keyRes.json()

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      // Send subscription to our server
      const subJson = subscription.toJSON()
      const saveRes = await fetch('/api/notifications/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint:    subJson.endpoint,
          keys:        subJson.keys,
          deviceLabel: navigator.userAgent.includes('iPad') ? 'iPad' : 'Device',
        }),
      })

      if (!saveRes.ok) throw new Error('Failed to save subscription')

      setSubscribed(true)
      return true

    } catch (err) {
      console.error('[usePushNotifications] Subscribe failed:', err)
      return false
    }
  }, [supported])

  const unsubscribe = useCallback(async (): Promise<void> => {
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (!sub) return

      // Remove from server
      await fetch('/api/notifications/unsubscribe', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: sub.endpoint }),
      })

      // Unsubscribe from browser
      await sub.unsubscribe()
      setSubscribed(false)

    } catch (err) {
      console.error('[usePushNotifications] Unsubscribe failed:', err)
    }
  }, [])

  return { permission, subscribed, supported, subscribe, unsubscribe }
}
