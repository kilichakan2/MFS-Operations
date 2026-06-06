# MFS-Operations — Project Guidance

## Architecture principle — build it like Lego

Every external dependency — database, auth, payments, file storage, email, search, any third-party service — sits behind an interface the app owns. The app talks to the interface, never to the vendor directly.

Three layers, strict top-to-bottom. Each layer only knows the one below it through a contract:

- **UI / presentation** — renders and captures input. Knows nothing about where data lives or which vendor stores it.
- **API / service layer** — the only thing the UI is allowed to call. Owns business logic and orchestration.
- **Adapters (data/integration layer)** — concrete implementations of the interfaces. This is the only place a vendor SDK is ever imported.

### Rules

- The UI never imports or calls a database/vendor SDK directly. UI → API → data. Always.
- Business logic depends on abstractions (interfaces/contracts), never on a concrete vendor. Dependencies point inward.
- Swapping a vendor = write one new adapter that satisfies the existing interface, change one wiring/config line. Nothing in the UI or business logic changes.
- Define the contract before the implementation. Contracts are stable; implementations are interchangeable.
- Vendor-specific types never leak past the adapter boundary — map them to your own domain models so the rest of the app never sees a vendor's shape.
- Each module is encapsulated: clear inputs, clear outputs, no reaching into another module's internals.

### Acceptance test

For every external dependency: **"If I rip out [the DB / auth / payment provider] tomorrow and replace it, how many files change?"** The answer must be: one adapter + one config line. More than that = the coupling is wrong, fix it before moving on.
