## 0. Infrastructure & Security
* **API Key Variable:** The backend route must use the existing Vercel environment variable `process.env.GOOGLE_MAPS_API_KEY` (or the equivalent variable currently used by the legacy Directions API).
* **Headers:** Do not hardcode the key. Pass it securely in the `X-Goog-Api-Key` header of the `computeRoutes` fetch request.
