CREATE TABLE IF NOT EXISTS contact_submissions (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('suggestion', 'bug', 'other')),
    message TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
    ON contact_submissions (created_at DESC);
