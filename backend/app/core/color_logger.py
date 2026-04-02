import logging

class ColorFormatter(logging.Formatter):
    """
    Custom logging formatter providing ANSI color-coded output.
    """
    # ANSI escape codes for colors
    GREY = "\x1b[38;20m"
    BLUE = "\x1b[34;20m"
    YELLOW = "\x1b[33;20m"
    RED = "\x1b[31;20m"
    BOLD_RED = "\x1b[31;1m"
    RESET = "\x1b[0m"

    # Define a custom standard format
    format_str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    FORMATS = {
        logging.DEBUG: GREY + format_str + RESET,
        logging.INFO: BLUE + format_str + RESET,
        logging.WARNING: YELLOW + format_str + RESET,
        logging.ERROR: RED + format_str + RESET,
        logging.CRITICAL: BOLD_RED + format_str + RESET
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno, self.format_str)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)

def setup_color_logging(level=logging.INFO):
    """
    Sets up the root logger with the ColorFormatter.
    """
    # Get the root logger
    logger = logging.getLogger()
    
    # Remove all existing handlers to prevent duplicate logs
    if logger.hasHandlers():
        logger.handlers.clear()

    # Create a stream handler (stdout/stderr)
    handler = logging.StreamHandler()
    handler.setFormatter(ColorFormatter())
    
    # Set the root logger's level
    logger.setLevel(level)
    handler.setLevel(level)
    logger.addHandler(handler)
    
    # Optional: apply to uvicorn/celery if needed
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi", "celery"):
        ext_logger = logging.getLogger(logger_name)
        ext_logger.handlers = []
        ext_logger.addHandler(handler)
        ext_logger.propagate = False
