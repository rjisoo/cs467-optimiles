"""Run Vite and Flask together, with their development reloaders enabled."""

import argparse
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time


ROOT = Path(__file__).resolve().parent
WINDOWS = os.name == "nt"
OUTPUT_LOCK = threading.Lock()


def log(service, message, selected_service=None):
    if selected_service and service not in (selected_service, "dev"):
        return
    prefix = "" if selected_service else f"[{service}]".ljust(10) + " "
    if sys.stdout.isatty() and os.environ.get("TERM") != "dumb":
        if prefix:
            color = {"frontend": "36", "backend": "35", "dev": "90"}[service]
            prefix = f"\033[{color}m{prefix}\033[0m"
        # OSC 8 makes URLs explicit, clickable links in terminals such as iTerm2.
        message = re.sub(
            r"https?://[^\s\x1b]+",
            lambda match: f"\033]8;;{match[0]}\033\\{match[0]}\033]8;;\033\\",
            message,
        )
    with OUTPUT_LOCK:
        print(f"{prefix}{message}", flush=True)


def stream_logs(service, stream, selected_service=None):
    with stream:
        for line in stream:
            if line.strip():
                log(service, line.rstrip("\r\n"), selected_service)


def stop_servers(processes):
    """Stop whole process trees, including Flask's reloader child."""
    for process in processes:
        if WINDOWS:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass

    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        finally:
            if not WINDOWS:
                # A reloader child may outlive its parent.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend-port", type=int, default=5173)
    parser.add_argument("--backend-port", type=int, default=5000)
    log_options = parser.add_mutually_exclusive_group()
    log_options.add_argument(
        "--frontend", dest="selected_service", action="store_const", const="frontend",
        help="Show only frontend logs without labels; both services still run.",
    )
    log_options.add_argument(
        "--backend", dest="selected_service", action="store_const", const="backend",
        help="Show only backend logs without labels; both services still run.",
    )
    args = parser.parse_args()

    def write_log(service, message):
        log(service, message, args.selected_service)

    node = shutil.which("node")
    vite = ROOT / "frontend/node_modules/vite/bin/vite.js"
    if not node or not vite.is_file():
        print("Install Node.js and run 'npm ci' in frontend/ first.", file=sys.stderr)
        return 1

    venv_python = ROOT / "backend/.venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
    python = str(venv_python) if venv_python.is_file() else sys.executable
    if subprocess.run([python, "-c", "import flask"], capture_output=True).returncode:
        print(
            "Backend dependencies are missing. Follow backend/README.md setup first.\n"
            f"Python selected: {python}",
            file=sys.stderr,
        )
        return 1

    services = [
        ("backend", [python, "-m", "flask", "--app", "backend.app", "run", "--debug",
                 "--host", "localhost", "--port", str(args.backend_port)], ROOT),
        ("frontend", [node, str(vite), "--host", "localhost", "--port",
                      str(args.frontend_port), "--strictPort", "--clearScreen", "false"],
         ROOT / "frontend"),
    ]
    processes = []
    readers = []

    def request_stop(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, request_stop)
    try:
        write_log("frontend", f"App: http://localhost:{args.frontend_port}/")
        write_log("backend", f"API: http://localhost:{args.backend_port}")
        write_log("backend", f"Docs: http://localhost:{args.backend_port}/docs")
        write_log("backend", f"Health: http://localhost:{args.backend_port}/api/health")
        write_log("dev", "Auto-reload enabled. Press Ctrl+C to stop both servers.")
        for name, command, cwd in services:
            process = subprocess.Popen(
                command,
                cwd=cwd,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                start_new_session=not WINDOWS,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if WINDOWS else 0,
            )
            processes.append(process)
            reader = threading.Thread(
                target=stream_logs, args=(name, process.stdout, args.selected_service), daemon=True,
            )
            reader.start()
            readers.append(reader)

        while True:
            for (name, _, _), process in zip(services, processes):
                code = process.poll()
                if code is not None:
                    write_log("dev", f"{name} exited ({code}); stopping both servers.")
                    return code if code > 0 else 1
            time.sleep(0.2)
    except KeyboardInterrupt:
        return 0
    except OSError as error:
        write_log("dev", f"Could not start development servers: {error}")
        return 1
    finally:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        stop_servers(processes)
        for reader in readers:
            reader.join(timeout=2)


if __name__ == "__main__":
    sys.exit(main())
