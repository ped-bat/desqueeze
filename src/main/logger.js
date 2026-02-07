import log from "electron-log";

// Configure logging
log.transports.file.level = "info";
log.transports.console.level = "info";

// Optional: format logs
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

export default log;
