# SafeSplit Secure Login Implementation

## Implemented authentication controls

- bcryptjs cost factor 12 with a unique salt per password
- password policy: at least 12 characters with uppercase, lowercase, number, and symbol
- Zod validation and generic invalid-login errors
- authentication endpoint rate limiting and 15-minute lockout after five failures
- email verification before login
- mandatory `JWT_SECRET` in the environment; no fallback secret
- JWT session in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- server-side session tracking, expiry, logout revocation, and old-session invalidation
- no-store authentication responses and append-only audit logging

## HTTPS without a domain

Nginx is configured for HTTPS on port 443 using a self-signed RSA certificate generated on EC2. The configuration uses TLS 1.2/1.3, ECDHE key exchange, and AES-GCM / ChaCha20-Poly1305 suites. Traffic is encrypted, but browsers warn because a self-signed certificate is not issued by a publicly trusted Certificate Authority.

See README.md for commands.
