"""
Domain Resolver - Backend Verification
========================================
Verifies signed domain context from frontend.

Matches the frontend signing in lib/domain/resolver.ts
- Algorithm: HMAC-SHA256
- Format: base64(payload).hex(signature)
- TTL: 5 minutes

@version 1.0.0
@securityLevel FAANG-Production
"""

import os
import json
import base64
import hashlib
import hmac
import time
from typing import Dict, Any, Optional
from dataclasses import dataclass

# =============================================================================
# CONFIGURATION
# =============================================================================

# Must match frontend CONTEXT_SIGNING_SECRET
DEFAULT_SECRET = 'dev-secret-change-in-production'
SIGNING_SECRET = os.environ.get('CONTEXT_SIGNING_SECRET', DEFAULT_SECRET)

# 5 minute TTL (in seconds)
CONTEXT_TTL_SECONDS = 5 * 60

# =============================================================================
# TYPES
# =============================================================================

@dataclass
class DomainContext:
    """Verified domain context."""
    domain: str
    tenantId: str
    userId: Optional[str]
    timestamp: int
    nonce: str
    environment: str

# =============================================================================
# VERIFICATION
# =============================================================================

class DomainResolver:
    """
    Backend domain resolver for verifying frontend-signed context.
    
    The frontend signs context with HMAC-SHA256 using a shared secret.
    This class verifies those signatures.
    """
    
    def __init__(self, secret: Optional[str] = None):
        self.secret = secret or SIGNING_SECRET
    
    def verify_context(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify signed context from frontend.
        
        Args:
            token: Signed context token in format "base64(payload).hex(signature)"
            
        Returns:
            Decoded context dict if valid, None otherwise
        """
        try:
            # Parse token
            parts = token.split('.')
            if len(parts) != 2:
                print(f"[DomainResolver] Invalid token format (expected 2 parts, got {len(parts)})")
                return None
            
            payload_b64, signature_hex = parts
            
            # Decode payload
            try:
                payload_bytes = base64.b64decode(payload_b64)
                payload = payload_bytes.decode('utf-8')
            except Exception as e:
                print(f"[DomainResolver] Failed to decode payload: {e}")
                return None
            
            # Verify signature
            expected_signature = self._sign_hmac(payload, self.secret)
            
            if signature_hex != expected_signature:
                print(f"[DomainResolver] Invalid signature")
                print(f"  Expected: {expected_signature[:16]}...")
                print(f"  Got: {signature_hex[:16]}...")
                return None
            
            # Parse payload
            context = json.loads(payload)
            
            # Verify timestamp (5 minute TTL)
            now_ms = int(time.time() * 1000)
            timestamp = context.get('timestamp', 0)
            
            if now_ms - timestamp > CONTEXT_TTL_SECONDS * 1000:
                print(f"[DomainResolver] Context expired (age: {(now_ms - timestamp) / 1000:.1f}s)")
                return None
            
            # Validate required fields
            required_fields = ['domain', 'tenantId', 'timestamp', 'nonce', 'environment']
            for field in required_fields:
                if field not in context:
                    print(f"[DomainResolver] Missing required field: {field}")
                    return None
            
            print(f"[DomainResolver] Context verified: {context.get('domain')} ({context.get('environment')})")
            return context
            
        except Exception as e:
            print(f"[DomainResolver] Verification error: {e}")
            return None
    
    def _sign_hmac(self, message: str, secret: str) -> str:
        """
        Sign message with HMAC-SHA256.
        
        Must match frontend signHmac() exactly:
        - HMAC-SHA256
        - Hex-encoded output
        - Lowercase hex
        """
        key = secret.encode('utf-8')
        msg = message.encode('utf-8')
        
        signature = hmac.new(key, msg, hashlib.sha256).digest()
        
        # Convert to lowercase hex (matching frontend Array.toString(16).padStart(2, '0'))
        return signature.hex()
    
    def verify_and_extract(self, token: str) -> Optional[DomainContext]:
        """
        Verify and extract typed DomainContext.
        
        Returns:
            DomainContext if valid, None otherwise
        """
        context = self.verify_context(token)
        if not context:
            return None
        
        return DomainContext(
            domain=context['domain'],
            tenantId=context['tenantId'],
            userId=context.get('userId'),
            timestamp=context['timestamp'],
            nonce=context['nonce'],
            environment=context['environment'],
        )

# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

domain_resolver = DomainResolver()

# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    'domain_resolver',
    'DomainResolver',
    'DomainContext',
    'SIGNING_SECRET',
    'CONTEXT_TTL_SECONDS',
]
