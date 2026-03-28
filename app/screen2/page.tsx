/**
 * app/screen2/page.tsx
 * Permanent redirect to /complaints — preserves bookmarks from before the rename.
 */
import { redirect } from 'next/navigation'
export default function Screen2Redirect() { redirect('/complaints') }
