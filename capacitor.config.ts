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
  plugins: {
    SunmiPrinter: {
      bindOnLoad: true,       // bind printer service when app opens
    },
  },
}

export default config
