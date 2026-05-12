import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.mfsglobal.ops',
  appName: 'MFS Operations',
  webDir:  'public',          // not bundled — remote URL mode
  server: {
    url:       'https://mfsops.com',
    cleartext: false,         // HTTPS only
  },
  android: {
    allowMixedContent: false,
  },
  // No Capacitor plugins — the Sunmi printer is reached via a native
  // JavaScript interface (window.MFSSunmiPrint), see ADR-0001.
}

export default config
