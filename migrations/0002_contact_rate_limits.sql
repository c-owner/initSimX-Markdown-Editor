CREATE TABLE IF NOT EXISTS contact_rate_limits (
    ip_hash TEXT PRIMARY KEY,
    window_started INTEGER NOT NULL,
    request_count INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_rate_limits_last_seen
    ON contact_rate_limits (last_seen);
