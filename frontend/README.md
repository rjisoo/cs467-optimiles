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

Run these commands from `frontend/`:

```sh
npm run lint
npm test
npm run build
```

- `npm run dev` starts Vite with hot reload.
- `npm run lint` runs ESLint with recommended JavaScript, TypeScript, React Hooks, and Vite Fast Refresh rules. Warnings fail the check; generated `dist/` files are ignored.
- `npm run lint:fix` applies available automatic ESLint fixes.
- `npm test` runs the test suite once and exits, suitable for local checks and CI.
- `npm run test:watch` reruns affected tests as files change. Press `q` to stop.
- `npm run build` checks TypeScript and builds the app into ignored `dist/` output.
- `npm run preview` serves an existing production build locally.

## Automatic checks before commits

The repository's [pre-commit hook](../.githooks/pre-commit) runs frontend lint, then the full test suite before each commit. If either check fails, the commit stops. Checks use the current working files, including unstaged changes, and do not modify or stage files.

After installing frontend dependencies, enable the hook once per clone. Run these commands from the **repository root**:

```sh
chmod +x .githooks/pre-commit
git config --local core.hooksPath .githooks
```

Verify the hook without creating a commit:

```sh
git hook run pre-commit
```

The hook file is shared through Git, but the `core.hooksPath` setting is local: each teammate must enable it in their checkout. Node and npm must be available to the terminal or Git client that creates the commit.

## Component tests

[Vitest](https://vitest.dev/guide/) uses the existing Vite plugins and `@/` alias, with JSDOM as the test environment. [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) renders components, `user-event` simulates interactions, and `jest-dom` supplies DOM assertions such as `toHaveFocus` and `toBeChecked`.

Place tests beside the code they exercise, using `*.test.ts` or `*.test.tsx`. Import `describe`, `it`, `expect`, and mocking helpers explicitly from `vitest`. Run one file with `npm test -- src/App.test.tsx`.

`src/test-setup.ts` loads the DOM matchers, cleans up rendered components after each test, and stubs `matchMedia` for the default desktop navigation plus `ResizeObserver` for Radix controls. Override these stubs in tests that need different browser behavior; global stubs are restored after each test. JSDOM does not perform browser layout; responsive sizing and visual checks still need a browser.

The initial suite covers independent cabin selection, clearing the trip draft with focus restoration, and opening/dismissing award help with the keyboard. It needs no backend service.

Verified on October 23, 2026 with the Node/npm versions above: ESLint passed with no warnings, all three tests passed, TypeScript and the production build passed, and the dev server served the page and app module successfully.

`npm audit` reports one vulnerable package, the existing team-pinned Vite **8.3.2**, with advisories up to high severity. npm lists **8.3.5** as the fix; updating that shared pin remains a separate follow-up.

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
