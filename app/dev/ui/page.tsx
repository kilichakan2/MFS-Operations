import { notFound } from 'next/navigation'
import { GalleryFrame } from './GalleryFrame'
import { GalleryForms } from './GalleryForms'
import { GalleryDisplay } from './GalleryDisplay'
import { GalleryOverlaysNav } from './GalleryOverlaysNav'

/**
 * Dev-only component gallery at /dev/ui.
 *
 * Gated so it does not exist in a production build (returns 404). Reachable only
 * by typing the path in a non-production build (e.g. `npm run dev`). Not linked
 * from any staff navigation.
 */
export default function DevUiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <GalleryFrame>
      <GalleryForms />
      <GalleryDisplay />
      <GalleryOverlaysNav />
    </GalleryFrame>
  )
}
