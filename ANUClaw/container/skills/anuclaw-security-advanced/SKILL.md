# ANUClaw Advanced Security

Healthcare-grade security implementation: OAuth2/OpenID Connect, JWT authentication, RBAC, ABAC, Zero Trust Security, consent management, data encryption, and HIPAA/GDPR-aligned audit logging.

## When to Use
- Implement authentication (OAuth2 / OIDC / JWT) for patient portals or APIs
- Define roles and permissions (RBAC/ABAC) for clinical staff and patients
- Enforce Zero Trust access policies
- Manage patient consent records
- Encrypt PHI/PII at rest and in transit
- Audit who accessed or modified patient data

---

## JWT Authentication

```python
# pip install pyjwt cryptography
import jwt
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional


SECRET_KEY = secrets.token_hex(32)  # Replace with env var in production: os.environ["JWT_SECRET"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 30


def create_access_token(subject: str, roles: list, extra_claims: dict = None) -> str:
    """Create a signed JWT access token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "roles": roles,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_hex(16),  # JWT ID for revocation
        "iss": "amgi-anuclaw",
        **(extra_claims or {}),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """Create a long-lived refresh token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token. Raises on invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"valid": True, "payload": payload}
    except jwt.ExpiredSignatureError:
        return {"valid": False, "error": "Token expired"}
    except jwt.InvalidTokenError as e:
        return {"valid": False, "error": str(e)}


def hash_password(password: str, salt: str = None) -> dict:
    """Hash a password with PBKDF2-HMAC-SHA256."""
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return {"hash": key.hex(), "salt": salt}


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verify a password against stored hash."""
    result = hash_password(password, salt)
    return secrets.compare_digest(result["hash"], stored_hash)
```

---

## OAuth2 / OpenID Connect

```python
# pip install authlib httpx
import secrets
import hashlib
import base64
from urllib.parse import urlencode


class OIDCClient:
    """
    OAuth2 / OpenID Connect client for ANUClaw patient portal integration.
    Supports Authorization Code flow with PKCE (SMART on FHIR compatible).
    """
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str,
                 authorization_endpoint: str, token_endpoint: str, jwks_uri: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.authorization_endpoint = authorization_endpoint
        self.token_endpoint = token_endpoint
        self.jwks_uri = jwks_uri

    def generate_pkce_pair(self) -> dict:
        """Generate PKCE code_verifier and code_challenge."""
        verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
        digest = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        return {"code_verifier": verifier, "code_challenge": challenge, "method": "S256"}

    def build_authorization_url(self, state: str, nonce: str, pkce: dict,
                                 scopes: list = None) -> str:
        """Build the OAuth2 authorization URL."""
        scopes = scopes or ["openid", "profile", "email", "fhirUser", "patient/*.read"]
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(scopes),
            "state": state,
            "nonce": nonce,
            "code_challenge": pkce["code_challenge"],
            "code_challenge_method": pkce["method"],
        }
        return f"{self.authorization_endpoint}?{urlencode(params)}"

    def exchange_code_for_token(self, code: str, code_verifier: str) -> dict:
        """Exchange authorization code for tokens (call this server-side)."""
        import httpx
        response = httpx.post(self.token_endpoint, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code_verifier": code_verifier,
        })
        return response.json()
```

---

## RBAC — Role-Based Access Control

```python
from typing import Set


# ANUClaw role hierarchy
ROLES = {
    "super_admin":    {"read_all", "write_all", "delete_all", "manage_users", "manage_roles", "audit_view"},
    "admin":          {"read_all", "write_all", "manage_users", "audit_view"},
    "physician":      {"read_patient", "write_patient", "prescribe", "order_lab", "view_imaging", "second_opinion"},
    "nurse":          {"read_patient", "write_vitals", "view_medications", "administer_medication"},
    "lab_technician": {"read_labs", "write_labs", "view_patient_basic"},
    "pharmacist":     {"view_medications", "verify_prescriptions", "check_interactions"},
    "researcher":     {"read_anonymized", "export_longitudinal", "run_models"},
    "patient":        {"read_own", "write_own_consent", "view_own_records"},
    "emergency":      {"read_patient", "write_patient", "prescribe", "order_lab"},
}

ROLE_HIERARCHY = {
    "super_admin": ["admin"],
    "admin": ["physician", "researcher"],
    "physician": ["nurse"],
    "emergency": ["nurse"],
}


def get_effective_permissions(role: str, visited: set = None) -> Set[str]:
    """Get all permissions for a role including inherited ones."""
    if visited is None:
        visited = set()
    if role in visited:
        return set()
    visited.add(role)
    perms = set(ROLES.get(role, []))
    for parent in ROLE_HIERARCHY.get(role, []):
        perms |= get_effective_permissions(parent, visited)
    return perms


def check_permission(user_roles: list, required_permission: str) -> bool:
    """Check if a user has a specific permission via any of their roles."""
    all_perms = set()
    for role in user_roles:
        all_perms |= get_effective_permissions(role)
    return required_permission in all_perms


def require_permission(user_roles: list, permission: str) -> None:
    """Raise PermissionError if user lacks a permission."""
    if not check_permission(user_roles, permission):
        raise PermissionError(f"Access denied. Required permission: '{permission}'. User roles: {user_roles}")
```

---

## ABAC — Attribute-Based Access Control

```python
def evaluate_abac_policy(subject: dict, resource: dict, action: str, environment: dict) -> dict:
    """
    Evaluate an ABAC policy for healthcare data access.
    subject: {uid, roles, department, clearance_level}
    resource: {type, owner_uid, sensitivity, department}
    action: "read" | "write" | "delete" | "export"
    environment: {time_of_day, access_location, emergency_override}
    Returns: {allowed: bool, reason: str}
    """
    # Emergency override
    if environment.get("emergency_override") and "emergency" in subject.get("roles", []):
        return {"allowed": True, "reason": "Emergency override active"}

    # Patient can only access own records
    if "patient" in subject.get("roles", []):
        if resource.get("owner_uid") != subject.get("uid"):
            return {"allowed": False, "reason": "Patients may only access their own records"}

    # Researcher can only access anonymized data
    if subject.get("roles") == ["researcher"]:
        if resource.get("sensitivity") != "anonymized":
            return {"allowed": False, "reason": "Researchers restricted to anonymized datasets"}

    # Department isolation: staff can only access records from their department
    if resource.get("department") and subject.get("department"):
        if resource["department"] != subject["department"] and "admin" not in subject.get("roles", []):
            return {"allowed": False, "reason": f"Cross-department access denied (resource: {resource['department']})"}

    # Time-based restriction for non-emergency access
    hour = environment.get("time_of_day", 12)
    if not (6 <= hour <= 22) and "emergency" not in subject.get("roles", []):
        return {"allowed": False, "reason": "After-hours access restricted to emergency staff"}

    # Role-based permission check
    perm_map = {"read": "read_patient", "write": "write_patient", "delete": "delete_all", "export": "export_longitudinal"}
    required = perm_map.get(action, action)
    if not check_permission(subject.get("roles", []), required):
        return {"allowed": False, "reason": f"Role does not have '{required}' permission"}

    return {"allowed": True, "reason": "Access granted"}
```

---

## Consent Management

```python
from datetime import datetime
import uuid


def create_consent_record(patient_uid: str, consented_to: str, granted_by: str,
                           purpose: str, expiry_date: str = None) -> dict:
    """Create a patient consent record."""
    return {
        "id": str(uuid.uuid4()),
        "patient_uid": patient_uid,
        "consented_to": consented_to,       # uid of the consented party (clinician / system)
        "purpose": purpose,                  # "treatment", "research", "marketing", "data_sharing"
        "status": "active",
        "granted_at": datetime.utcnow().isoformat(),
        "granted_by": granted_by,            # uid of who clicked "agree"
        "expiry_date": expiry_date,
        "revoked_at": None,
        "revoked_by": None,
        "fhir_consent_id": None,             # link to FHIR Consent resource when synced
    }


def revoke_consent(consent: dict, revoked_by: str) -> dict:
    """Mark a consent record as revoked."""
    consent["status"] = "revoked"
    consent["revoked_at"] = datetime.utcnow().isoformat()
    consent["revoked_by"] = revoked_by
    return consent


def check_consent(consent_records: list, patient_uid: str, consented_to: str, purpose: str) -> dict:
    """Check whether active consent exists for a given party and purpose."""
    now = datetime.utcnow().isoformat()
    for c in consent_records:
        if (c["patient_uid"] == patient_uid and
                c["consented_to"] == consented_to and
                c["purpose"] == purpose and
                c["status"] == "active" and
                (c["expiry_date"] is None or c["expiry_date"] > now)):
            return {"consented": True, "consent_id": c["id"]}
    return {"consented": False, "reason": "No active consent found"}
```

---

## Data Encryption

```python
# pip install cryptography
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
import base64
import os


def generate_fernet_key() -> str:
    """Generate a Fernet symmetric key for field-level encryption."""
    return Fernet.generate_key().decode()


def encrypt_phi(plaintext: str, key: str) -> str:
    """Encrypt PHI/PII using Fernet symmetric encryption."""
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.encrypt(plaintext.encode()).decode()


def decrypt_phi(ciphertext: str, key: str) -> str:
    """Decrypt Fernet-encrypted PHI/PII."""
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.decrypt(ciphertext.encode()).decode()


def anonymize_profile(profile: dict) -> dict:
    """Remove or hash all direct identifiers for research use."""
    import hashlib, copy
    anon = copy.deepcopy(profile)
    # Replace UID with one-way hash
    anon["uid"] = "ANON-" + hashlib.sha256(profile["uid"].encode()).hexdigest()[:12].upper()
    # Remove direct identifiers
    for field in ["first_name", "last_name", "email", "phone", "address"]:
        anon["demographics"].pop(field, None)
    # Generalise date of birth to birth year only
    dob = anon["demographics"].get("date_of_birth", "")
    anon["demographics"]["birth_year"] = dob[:4] if dob else None
    anon["demographics"].pop("date_of_birth", None)
    anon["administrative"].pop("insurance_id", None)
    anon["administrative"].pop("emergency_contacts", None)
    return anon
```

---

## Audit Logging

```python
import json
from datetime import datetime, timezone


def create_audit_event(actor_uid: str, action: str, resource_type: str,
                        resource_id: str, outcome: str, details: dict = None) -> dict:
    """
    Create a HIPAA/GDPR-compliant audit log event.
    outcome: "success" | "failure" | "denied"
    """
    return {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor_uid": actor_uid,
        "action": action,           # "read", "write", "delete", "export", "login", "consent_grant"
        "resource_type": resource_type,
        "resource_id": resource_id,
        "outcome": outcome,
        "details": details or {},
        "source": "ANUClaw",
    }


def write_audit_log(event: dict, log_path: str = "/workspace/output/audit/audit.jsonl") -> None:
    """Append an audit event to the JSONL audit log."""
    from pathlib import Path
    Path(log_path).parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")


def query_audit_log(log_path: str, actor_uid: str = None, resource_id: str = None,
                     action: str = None) -> list:
    """Query the audit log for specific events."""
    events = []
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                event = json.loads(line)
                if actor_uid and event.get("actor_uid") != actor_uid:
                    continue
                if resource_id and event.get("resource_id") != resource_id:
                    continue
                if action and event.get("action") != action:
                    continue
                events.append(event)
    except FileNotFoundError:
        pass
    return events
```

---

## Zero Trust Security Checker

```python
def evaluate_zero_trust_posture(request: dict) -> dict:
    """
    Zero Trust evaluation: never trust, always verify.
    request: {token, device_id, ip_address, mfa_verified, resource, action}
    Returns: {allow: bool, risk_score: int, checks: dict}
    """
    checks = {}
    risk = 0

    # 1. Token validity
    token_result = verify_token(request.get("token", ""))
    checks["token_valid"] = token_result["valid"]
    if not token_result["valid"]:
        return {"allow": False, "risk_score": 100, "checks": checks, "reason": token_result.get("error")}

    # 2. MFA
    checks["mfa_verified"] = request.get("mfa_verified", False)
    if not checks["mfa_verified"]:
        risk += 30

    # 3. Known device
    checks["known_device"] = bool(request.get("device_id"))
    if not checks["known_device"]:
        risk += 20

    # 4. IP reputation (placeholder — integrate threat intel feed)
    ip = request.get("ip_address", "")
    checks["ip_flagged"] = ip.startswith("10.") is False and ip.startswith("192.168.") is False
    if checks["ip_flagged"]:
        risk += 15

    # 5. Least-privilege check
    roles = token_result["payload"].get("roles", [])
    perm_map = {"read": "read_patient", "write": "write_patient"}
    required_perm = perm_map.get(request.get("action", ""), request.get("action", ""))
    checks["has_permission"] = check_permission(roles, required_perm)
    if not checks["has_permission"]:
        return {"allow": False, "risk_score": 100, "checks": checks, "reason": "Insufficient permissions"}

    allow = risk < 50
    return {"allow": allow, "risk_score": risk, "checks": checks,
            "reason": "Access granted" if allow else f"Risk score {risk} exceeds threshold"}
```

## Output
Save audit logs to `/workspace/output/audit/`. Save consent records as JSON to `/workspace/output/consent/`. Encryption keys must never be written to output — use environment variables or a secrets manager.
