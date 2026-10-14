# OptiMiles frontend

React + TypeScript starter, manually generated with **create-vite 9.2.1**, standard **react-ts** template. Follow the shared [conventions](../docs/contributing.md).

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
