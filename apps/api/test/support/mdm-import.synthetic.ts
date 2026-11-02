// Regression fixture using the supplied public JD qualification wording.
export const mdmJd = `Top 3 Reasons To Join Us
Full social, health & unemployment insurance
Annual learning and training budget
The Job
1. GENERAL INFORMATION
Position: Fullstack Developer
Department: Engineering
Report to: Tech Lead / Sub Lead
Headcount: 4
Level: Middle/ Senior
2. JOB PURPOSE
Develop backend, frontend, and mobile features for Mobile Device Management (MDM) products, ensuring high-quality code, performance, and security. Contribute to building a competitive MDM product in the Vietnamese market.
3. KEY RESPONSIBILITIES
Develop backend services including device management APIs, policy engines, and command queues.
Build web dashboards (Admin Consoles) for MDM administrators.
Develop mobile agent applications on Android and/or iOS for managed devices.
Implement MDM features such as remote lock/wipe, kiosk mode, and app blacklisting/whitelisting.
Contribute to device security flows: enrollment, attestation, key provisioning, and certificate lifecycle (under Tech Lead guidance).
Write unit and integration tests to ensure code coverage meets requirements.
Participate in code reviews and contribute to architectural and procedural improvements.
Fix bugs, optimize performance, and resolve technical debt.
Stay updated with Android Enterprise, Apple MDM protocol, and SCEP/DEP.
Your Skills and Experience
4. REQUIREMENTS
4.1. Education
Bachelor's degree in IT, Computer Science, Information Security, or equivalent.
4.2. Experience
3–5 years of experience in software development. Prior experience in mobile development or device security products is preferred.
4.3. Technical Skills
a) Software Development
Backend: Golang, Java, Node.js or Python; RESTful API, SQL/NoSQL databases.
Frontend: React.js or Vue.js, TypeScript, responsive design.
Mobile: Android (Kotlin/Java) or iOS (Swift); React Native is a plus.
Cloud: AWS basic (EC2, S3, Lambda), Firebase Cloud Messaging.
Tools: Git, Docker, CI/CD, Agile/Scrum.
b) Hardware Security & Trusted Execution
Working knowledge of on-device security chips/environments and how to use them in real-world applications (deep expertise in all platforms is not required):
Basic understanding of SEP, key generation/storage via Secure Enclave–backed keys, biometric-bound keys, and Keychain access control.
Use Android Keystore with StrongBox, understand differences between software, TEE-backed, and StrongBox-backed keys; familiarity with Key Attestation.
Familiarity with PCRs, sealed storage, remote attestation, and EK/AIK; able to learn on the job for desktop agent work.
Familiarity with HSM / cloud KMS concepts; integration experience (AWS KMS, GCP KMS, Azure Key Vault, or PKCS#11) is a plus.
Understand Root of Trust, Secure Boot, Verified Boot, and attestation concepts.
c) Cryptography & Applied Cryptography
Understand and correctly use common cryptographic algorithms for each problem; designing cryptographic protocols from scratch is not required:
AES-128/256 with GCM, CBC, CTR modes; avoid nonce reuse and padding oracles; familiarity with ChaCha20-Poly1305.
RSA (PKCS#1 v1.5, OAEP, PSS) ≥ 2048 bits; understand why RSA-PSS is preferred for signatures.
ECDSA, EdDSA (Ed25519), ECDH/X25519 over NIST and Curve25519; understand why ECC is preferred on mobile.
SHA-2, SHA-3, HMAC; KDFs such as HKDF, PBKDF2, Argon2, scrypt.
Awareness of ML-KEM (Kyber), ML-DSA (Dilithium), and post-quantum trends is a plus.
Use well-vetted libraries (Tink, libsodium, BoringSSL, BouncyCastle, JCA/JCE, CryptoKit); never roll custom cryptography.
d) Data Encryption & Digital Signatures
Able to implement common data protection mechanisms in MDM products following the Tech Lead's design:
FDE, FBE on Android, FileVault/APFS, envelope encryption (DEK/KEK) at the implementation level.
TLS 1.2/1.3, mTLS between MDM server and agent, certificate pinning, OCSP stapling, HSTS; aware of common attacks.
X.509, CSR, certificate chain validation, OCSP/CRL, SCEP, EST, ACME at the usage level.
Sign and verify commands/policies, APK/IPA signing & verification, JWT/JWS for API authentication.
Understand key lifecycle and separation of signing keys from encryption keys.
Familiarity with FIPS 140-2/140-3, NIST SP 800-series, and Vietnamese cryptographic regulations is a plus.
4.4. Soft Skills
High level of autonomy and proactive problem-solving.
Eagerness to learn and stay updated with new technologies.
Strong collaboration skills and willingness to support teammates.
Security mindset — ability to think like an attacker.
English reading comprehension for technical documentation.
Why You'll Love Working Here
5. BENEFITS
Negotiable based on capability
Full Social, Health, and Unemployment Insurance.
Other benefits to be discussed during the interview.
Monday – Friday, 8:00 AM – 5:00 PM.`;
