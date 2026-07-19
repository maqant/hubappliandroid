# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately.

## Security Measures

### Secrets Management

- All API keys and secrets are server-side only
- `.env` and `.env.local` are git-ignored
- `.env.example` contains no real values
- No `NEXT_PUBLIC_` secrets

### Input Validation

- All API inputs validated with Zod
- Source content treated as untrusted data
- Prompt injection protection via sanitization
- No command or URL execution from user input

### Output Security

- No stack traces in client responses
- Structured error format without internals
- Log redaction for sensitive values
- No full source text in logs by default

### Provider Security

- AI calls route through server-side Model Gateway only
- No API keys in client bundle
- Provider selection via server environment variables
- Rate limiting prepared (not enforced in demo mode)

### Data Privacy

- Demo mode uses synthetic data only
- Local storage for demo persistence
- Export and delete capabilities
- No telemetry or tracking in demo mode
