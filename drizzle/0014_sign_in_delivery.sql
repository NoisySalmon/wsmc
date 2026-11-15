ALTER TABLE sign_in_tokens ADD COLUMN channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'qr'));
--> statement-breakpoint
-- Preserve the separate lifecycle of QR codes issued before this migration.
UPDATE sign_in_tokens SET channel = 'qr' WHERE expires_at - created_at <= 300000;
--> statement-breakpoint

CREATE TABLE auth_request_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_request_limits_expiry_idx ON auth_request_limits (expires_at);
--> statement-breakpoint
