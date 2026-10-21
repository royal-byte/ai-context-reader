# Security

Report a vulnerability privately through GitHub's “Report a vulnerability” flow if available, or open a minimal issue without including API keys, personal favorites or other sensitive data.

## Model

- The API key is stored in extension storage and is not exported.
- Content scripts receive only reader preferences; they do not receive the API key.
- Only explicit selections trigger model requests. The extension validates message senders, site permissions and save payloads.
- The extension has no remote code, backend or telemetry.

## Known limitations

- Client-side extension storage is not an OS keychain. A compromised browser profile or device can read local extension data.
- A custom API endpoint is chosen by the user; verify its ownership before sending text.
- Local backups are plain JSON unless the user protects the file separately.
