#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [ -x .venv/Scripts/python.exe ]; then
    PYTHON_EXEC_NAME=.venv/Scripts/python.exe
elif [ -x .venv/bin/python ]; then
    PYTHON_EXEC_NAME=.venv/bin/python
elif [ -x .venv/bin/python3 ]; then
    PYTHON_EXEC_NAME=.venv/bin/python3    
else
    PYTHON_EXEC_NAME=python
fi

"$PYTHON_EXEC_NAME" -m pytest tests