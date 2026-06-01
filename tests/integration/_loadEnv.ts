/**
 * tests/integration/_loadEnv.ts
 *
 * Loads .env.test.local before any test runs. Vitest setupFiles
 * are imported before test files, so this gives _setup.ts access
 * to the env vars it needs.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../../.env.test.local') })
