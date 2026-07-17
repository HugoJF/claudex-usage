# Data Model

The catalog and SURF-002 production shell retain only process-local presentation
state. Provider readings, reset timestamps, raw responses, credentials, and errors
are never persisted. SURF-003 is the first slice permitted to add durable panel
preferences.
