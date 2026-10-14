# Deliverable 2 — Secure Login Notes

## HTTPS deployment without a domain

SafeSplit is accessed through an EC2 public IP address and uses a self-signed TLS certificate. The certificate encrypts browser-to-server traffic, enables TLS key establishment, and allows Secure cookies. Browsers display a warning because the certificate is not issued by a publicly trusted Certificate Authority. A production deployment would use a domain and a trusted certificate.

## TLS details

Nginx enables only TLS 1.2 and TLS 1.3. TLS 1.2 permits:
- ECDHE-RSA-AES256-GCM-SHA384
- ECDHE-RSA-CHACHA20-POLY1305
- ECDHE-RSA-AES128-GCM-SHA256

ECDHE creates an ephemeral shared secret per connection, providing forward secrecy. AES-GCM and ChaCha20-Poly1305 provide authenticated encryption for confidentiality and integrity. The self-signed RSA private key is stored at `certs/selfsigned.key`, permission 600, is excluded from Git, and mounted read-only into Nginx.

## User authentication

Passwords are stored only as bcrypt hashes at cost factor 12. Bcrypt generates and embeds a unique random salt for each password. Login validation, rate limiting, temporary lockout, email verification, server-side revocable sessions, `HttpOnly`/`Secure`/`SameSite=Strict` cookies, and append-only audit logs protect the authentication process.
