import logging
import os
from logging.handlers import TimedRotatingFileHandler

def setup_logging(log_file: str | None = None, level=logging.INFO):
    """
    Sets up the centralized logging system.
    If log_file is provided, it logs to that file with daily rotation.
    """
    # Ensure log directory exists if a file is provided
    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            try:
                os.makedirs(log_dir, exist_ok=True)
            except Exception as e:
                print(f"Failed to create log directory {log_dir}: {e}")
                log_file = None # Fallback to console only

    # Reset existing handlers if any to avoid duplicates on re-init
    root_logger = logging.getLogger()
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
        
    root_logger.setLevel(level)

    # Standard format: 2024-02-18 00:00:00,000 - name - LEVEL - message
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    # 1. Console Handler (stdout)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # 2. File Handler (Daily Rotation)
    try:
        file_handler = TimedRotatingFileHandler(
            log_file, 
            when="midnight", 
            interval=1, 
            backupCount=30, # Keep 30 days of history
            encoding='utf-8'
        )
        file_handler.setFormatter(formatter)
        # Suffix for the rotated files: YYYY-MM-DD
        file_handler.suffix = "%Y-%m-%d"
        root_logger.addHandler(file_handler)
    except Exception as e:
        print(f"Warning: Could not initialize file logging: {e}")

    # Silence some noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.ERROR)
    
    root_logger.info(f"Logging initialized. File: {log_file}")
    return root_logger

def get_logger(name: str):
    """Returns a named logger."""
    return logging.getLogger(name)
