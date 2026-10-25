# cs467-optimiles

## Run frontend and API together

Complete the [frontend setup](frontend/README.md#local-setup-and-commands) and
[backend setup](backend/README.md#setup) once. Then, from the repository root:

```sh
python dev.py
```

On Windows, use `py dev.py`. The launcher uses `backend/.venv` when present;
otherwise, it uses the Python interpreter running the script. It does not install
dependencies.

- Frontend: http://localhost:5173
- API documentation: http://localhost:5000/docs
- API health check: http://localhost:5000/api/health

Open the frontend URL once and leave the command running. Saved React, TypeScript,
and CSS changes update the browser through Vite's hot reload. Saved Python changes
restart Flask automatically, so subsequent API requests use the updated code.
Press Ctrl+C to stop both servers. If either server exits, the launcher stops the
other too.

Logs are labeled `[frontend]` and `[backend]`, with distinct colors in the terminal.
In iTerm2, hold Command and click a service URL to open it. Redirected output stays
plain text, and Vite keeps the shared log visible when code changes.

To show only one service's logs without labels, use one of these flags:

```sh
python dev.py --frontend
python dev.py --backend
```

Both services still run with automatic reloads. The flag filters service logs and
startup links; launcher status and errors remain visible without labels.
With neither flag, both services' logs keep their labels.

If a port is already in use, choose different ports:

```sh
python dev.py --frontend-port 5174 --backend-port 5001
```

## Run only the frontend

Use the [required Node.js and npm versions](frontend/README.md#tool-versions). From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

`npm ci` installs the packages from the lockfile. Open the local URL printed in the terminal. Press Ctrl+C to stop the server.
