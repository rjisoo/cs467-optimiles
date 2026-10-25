import logging
import sys
from logging.config import dictConfig
from pathlib import Path
import os 

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s [%(levelname)-8s] | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": sys.stdout,
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "default",
            "filename": os.getenv("BACKEND_LOG_PATH") or "backend/logs/backend.log",
            "maxBytes": 10485760,  # 10 MB
            "backupCount": 5,      # Keep up to 5 backup files
            "encoding": "utf-8",
        },
    },
    "loggers": {
        "": {  # Root logger catches everything
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": True,
        },
        "uvicorn": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

# Ensure the log file exists
LOG_PATH = Path(LOGGING_CONFIG["handlers"]["file"]["filename"]).parent
LOG_PATH.mkdir(parents=True, exist_ok=True)
LOG_PATH.chmod(0o700)  # Set directory permissions to rwx------ for security
LOG_PATH.touch(exist_ok=True) 

dictConfig(LOGGING_CONFIG)
