/**
 * app/screen3/page.tsx
 * Permanent redirect to /visits — preserves bookmarks from before the rename.
 */
import { redirect } from 'next/navigation'
export default function Screen3Redirect() { redirect('/visits') }
