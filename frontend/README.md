# OptiMiles frontend

React + TypeScript frontend, originally generated with **create-vite 9.2.1**, standard **react-ts** template. Follow the shared [conventions](../docs/contributing.md).

## Tool versions

Use Node **26.7.0** and npm **11.19.0**. Installed pins match `package.json` and `package-lock.json`: React/React DOM **19.3.0**, Vite **8.3.2**, TypeScript **6.0.2**, and **@types/node 26.6.5**. Retain the lockfile for the complete resolved dependency set.

## Local setup and commands

For a fresh checkout, start at the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite; press Ctrl+C to stop. The current starter needs no environment file or backend service. Backend connection details remain pending team agreement.

From `frontend/`, the existing checks are:

```sh
npm run lint
npm run build
```

Lint uses Oxlint; build runs TypeScript and Vite and writes ignored `dist/` output. `npm run preview` can serve an existing build locally. There is no application test suite yet.

## Icons

UI icons use [Lucide React](https://lucide.dev/guide/react), with named imports in `src/components/Icon.tsx`. Add icons there to retain consistent sizing, stroke weight, and decorative accessibility attributes. The package version is pinned in `package.json` and `package-lock.json`.

## UI structure

[shadcn/ui](https://ui.shadcn.com/docs) components live in `src/components/ui/`. They are local source files, backed by Radix primitives and styled with Tailwind CSS v4. The initial components came from the official `radix-nova` registry on October 19, 2026; their MIT notice is retained alongside them. Lucide supplies their icons.

- `App.tsx` owns the in-memory trip draft and reset action.
- `AppNavigation.tsx` handles the responsive navigation disclosure and breakpoint focus handoff.
- `AwardHelp.tsx` uses the shared Dialog for focus trapping, dismissal, and focus restoration.
- `TripEntry.tsx` composes shared controls and keeps the growing textarea within the available desktop height.
- `src/index.css` defines the original navy Premium theme, global focus treatment, and Radix state variants. Existing layout color names alias those same theme tokens.
- `App.css` and `TripEntry.css` contain screen layout and context styles. Shared control defaults belong in `components/ui/`, including 44px default controls and readable disabled states.

Import shared controls with `@/components/ui/...`. `components.json` records the registry style and aliases; Vite and TypeScript resolve `@/` to `src/`. Add only components needed by the current screen. Review generated updates before replacing local defaults, especially focus, sizing, disabled colors, and textarea sizing. Dependency changes follow the repository's manual setup policy.

The interface remains a static preview: no search or prompt processing, no persistence, and no backend calls. Cabin choices are independent, and New trip clears the draft. Future result panels can reuse the same Card, Badge, Button, Separator, and theme tokens.
