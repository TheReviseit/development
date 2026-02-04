"""
Console Auth Service
Isolated authentication for OTP Developer Console

Features:
- bcrypt password hashing
- JWT token generation (access + refresh)
- Session management
- Email verification
- Password reset
- Rate limiting for auth endpoints
"""

import os
import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

import bcrypt
import jwt

logger = logging.getLogger('console.auth')

# =============================================================================
# CONFIGURATION
# =============================================================================

JWT_SECRET = os.getenv('JWT_SECRET', 'flowauxi-jwt-secret-change-in-production')
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 15
JWT_REFRESH_TOKEN_EXPIRE_DAYS = 7
JWT_ALGORITHM = 'HS256'

# Rate limiting config
AUTH_RATE_LIMIT_IP_PER_MINUTE = 5
AUTH_RATE_LIMIT_EMAIL_PER_HOUR = 10
AUTH_RATE_LIMIT_BLOCK_MINUTES = 15


@dataclass
class AuthUser:
    """Authenticated user context."""
    id: str
    email: str
    name: Optional[str]
    is_email_verified: bool
    current_org_id: Optional[str] = None
    current_org_role: Optional[str] = None


# =============================================================================
# PASSWORD HASHING
# =============================================================================

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash."""
    try:
        return bcrypt.checkpw(
            password.encode('utf-8'),
            password_hash.encode('utf-8')
        )
    except Exception:
        return False


# =============================================================================
# JWT TOKEN MANAGEMENT
# =============================================================================

def create_access_token(user_id: str, org_id: Optional[str] = None) -> str:
    """Create short-lived access token with user_type claim."""
    expires = datetime.utcnow() + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    payload = {
        'sub': user_id,
        'type': 'access',
        'user_type': 'console',  # CRITICAL: Identity claim for cross-auth protection
        'exp': expires,
        'iat': datetime.utcnow()
    }
    
    if org_id:
        payload['org'] = org_id
    
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> Tuple[str, str]:
    """
    Create long-lived refresh token.
    
    Returns:
        Tuple of (token, token_hash) - store hash in DB
    """
    expires = datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    
    payload = {
        'sub': user_id,
        'type': 'refresh',
        'exp': expires,
        'iat': datetime.utcnow(),
        'jti': secrets.token_hex(16)  # Unique token ID
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    
    return token, token_hash


def verify_token(token: str, expected_type: str = 'access') -> Optional[Dict]:
    """
    Verify and decode JWT token.
    
    Args:
        token: JWT token string
        expected_type: 'access' or 'refresh'
        
    Returns:
        Decoded payload or None if invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        if payload.get('type') != expected_type:
            return None
        
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Invalid token: {e}")
        return None


def generate_verification_token() -> str:
    """Generate email verification token."""
    return secrets.token_urlsafe(32)


def generate_reset_token() -> str:
    """Generate password reset token."""
    return secrets.token_urlsafe(32)


# =============================================================================
# CONSOLE AUTH SERVICE
# =============================================================================

class ConsoleAuthService:
    """
    Authentication service for OTP Developer Console.
    
    Features:
    - Email/password signup and login
    - Automatic organization creation on signup
    - JWT access + refresh tokens
    - Rate limiting
    - Audit logging
    """
    
    def __init__(self, supabase_client):
        self.db = supabase_client
    
    # -------------------------------------------------------------------------
    # SIGNUP
    # -------------------------------------------------------------------------
    
    async def signup(
        self,
        email: str,
        password: str,
        name: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create new console user account.
        
        Flow:
        1. Check rate limits
        2. Validate email/password
        3. Create user
        4. Create default organization
        5. Add user as owner
        6. Send verification email
        7. Return tokens
        """
        email = email.lower().strip()
        
        # Rate limit check
        rate_check = await self._check_auth_rate_limit(ip_address, email, 'signup')
        if not rate_check['allowed']:
            return {
                'success': False,
                'error': 'RATE_LIMITED',
                'message': rate_check['message'],
                'retry_after': rate_check.get('retry_after')
            }
        
        # Validate email format
        if not self._is_valid_email(email):
            return {
                'success': False,
                'error': 'INVALID_EMAIL',
                'message': 'Invalid email format'
            }
        
        # Validate password strength
        password_check = self._validate_password(password)
        if not password_check['valid']:
            return {
                'success': False,
                'error': 'WEAK_PASSWORD',
                'message': password_check['message']
            }
        
        # Check if email exists
        try:
            existing = self.db.table('otp_console_users').select('id').eq(
                'email', email
            ).execute()
            
            if existing.data and len(existing.data) > 0:
                return {
                    'success': False,
                    'error': 'EMAIL_EXISTS',
                    'message': 'An account with this email already exists'
                }
        except Exception as e:
            logger.error(f"Error checking existing email: {e}")
            return {
                'success': False,
                'error': 'DATABASE_ERROR',
                'message': 'Unable to process request'
            }
        
        # Hash password
        password_hash = hash_password(password)
        verification_token = generate_verification_token()
        
        try:
            # Create user
            user_result = self.db.table('otp_console_users').insert({
                'email': email,
                'password_hash': password_hash,
                'name': name or email.split('@')[0],
                'verification_token': verification_token,
                'verification_token_expires': (datetime.utcnow() + timedelta(days=7)).isoformat()
            }).execute()
            
            user = user_result.data[0]
            user_id = user['id']
            
            # Create default organization
            org_name = f"{name or email.split('@')[0]}'s Organization"
            org_slug = self._generate_slug(org_name)
            
            org_result = self.db.table('otp_organizations').insert({
                'name': org_name,
                'slug': org_slug,
                'owner_id': user_id
            }).execute()
            
            org = org_result.data[0]
            org_id = org['id']
            
            # Add user as org owner
            self.db.table('otp_org_members').insert({
                'org_id': org_id,
                'user_id': user_id,
                'role': 'owner',
                'accepted_at': datetime.utcnow().isoformat()
            }).execute()
            
            # Create default test project
            self.db.table('otp_projects').insert({
                'org_id': org_id,
                'name': 'My First Project',
                'description': 'Default test project',
                'environment': 'test'
            }).execute()
            
            # Generate tokens
            access_token = create_access_token(user_id, org_id)
            refresh_token, refresh_hash = create_refresh_token(user_id)
            
            # Store refresh token
            self.db.table('otp_console_sessions').insert({
                'user_id': user_id,
                'refresh_token_hash': refresh_hash,
                'ip_address': ip_address,
                'expires_at': (datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
            }).execute()
            
            # Audit log
            await self._audit_log(user_id, org_id, 'signup', ip_address=ip_address)
            
            # TODO: Send verification email
            # await self._send_verification_email(email, verification_token)
            
            return {
                'success': True,
                'user': {
                    'id': user_id,
                    'email': email,
                    'name': user.get('name'),
                    'is_email_verified': False
                },
                'org': {
                    'id': org_id,
                    'name': org_name,
                    'slug': org_slug
                },
                'access_token': access_token,
                'refresh_token': refresh_token,
                'expires_in': JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
            }
            
        except Exception as e:
            logger.error(f"Signup error: {e}")
            return {
                'success': False,
                'error': 'SIGNUP_FAILED',
                'message': 'Unable to create account'
            }
    
    # -------------------------------------------------------------------------
    # LOGIN
    # -------------------------------------------------------------------------
    
    async def login(
        self,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Authenticate user and return tokens.
        """
        email = email.lower().strip()
        
        # Rate limit check
        rate_check = await self._check_auth_rate_limit(ip_address, email, 'login')
        if not rate_check['allowed']:
            return {
                'success': False,
                'error': 'RATE_LIMITED',
                'message': rate_check['message'],
                'retry_after': rate_check.get('retry_after')
            }
        
        try:
            # Fetch user
            result = self.db.table('otp_console_users').select('*').eq(
                'email', email
            ).single().execute()
            
            user = result.data
            
            if not user:
                await self._record_auth_attempt(ip_address, email, 'login', False)
                return {
                    'success': False,
                    'error': 'INVALID_CREDENTIALS',
                    'message': 'Invalid email or password'
                }
            
            # Verify password
            if not verify_password(password, user['password_hash']):
                await self._record_auth_attempt(ip_address, email, 'login', False)
                return {
                    'success': False,
                    'error': 'INVALID_CREDENTIALS',
                    'message': 'Invalid email or password'
                }
            
            user_id = user['id']
            
            # Get user's primary org
            org_result = self.db.table('otp_org_members').select(
                'org_id, role, otp_organizations(id, name, slug)'
            ).eq('user_id', user_id).limit(1).execute()
            
            org_membership = org_result.data[0] if org_result.data else None
            org = org_membership.get('otp_organizations') if org_membership else None
            org_id = org['id'] if org else None
            
            # Generate tokens
            access_token = create_access_token(user_id, org_id)
            refresh_token, refresh_hash = create_refresh_token(user_id)
            
            # Store refresh token
            self.db.table('otp_console_sessions').insert({
                'user_id': user_id,
                'refresh_token_hash': refresh_hash,
                'ip_address': ip_address,
                'user_agent': user_agent,
                'expires_at': (datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
            }).execute()
            
            # Update last login
            self.db.table('otp_console_users').update({
                'last_login_at': datetime.utcnow().isoformat(),
                'last_login_ip': ip_address,
                'login_count': user.get('login_count', 0) + 1
            }).eq('id', user_id).execute()
            
            # Audit log
            await self._audit_log(user_id, org_id, 'login', ip_address=ip_address)
            
            return {
                'success': True,
                'user': {
                    'id': user_id,
                    'email': user['email'],
                    'name': user.get('name'),
                    'is_email_verified': user.get('is_email_verified', False)
                },
                'org': {
                    'id': org_id,
                    'name': org.get('name') if org else None,
                    'slug': org.get('slug') if org else None,
                    'role': org_membership.get('role') if org_membership else None
                } if org else None,
                'access_token': access_token,
                'refresh_token': refresh_token,
                'expires_in': JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
            }
            
        except Exception as e:
            logger.error(f"Login error: {e}")
            return {
                'success': False,
                'error': 'LOGIN_FAILED',
                'message': 'Unable to process login'
            }
    
    # -------------------------------------------------------------------------
    # LOGOUT
    # -------------------------------------------------------------------------
    
    async def logout(
        self,
        user_id: str,
        refresh_token: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """Invalidate refresh token."""
        try:
            if refresh_token:
                token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
                self.db.table('otp_console_sessions').delete().eq(
                    'refresh_token_hash', token_hash
                ).execute()
            
            await self._audit_log(user_id, None, 'logout', ip_address=ip_address)
            
            return {'success': True}
        except Exception as e:
            logger.error(f"Logout error: {e}")
            return {'success': True}  # Don't fail logout
    
    # -------------------------------------------------------------------------
    # GET CURRENT USER
    # -------------------------------------------------------------------------
    
    async def get_current_user(self, user_id: str) -> Optional[AuthUser]:
        """Get current authenticated user context."""
        try:
            result = self.db.table('otp_console_users').select(
                'id, email, name, is_email_verified'
            ).eq('id', user_id).single().execute()
            
            user = result.data
            if not user:
                return None
            
            # Get primary org
            org_result = self.db.table('otp_org_members').select(
                'org_id, role'
            ).eq('user_id', user_id).limit(1).execute()
            
            org_membership = org_result.data[0] if org_result.data else None
            
            return AuthUser(
                id=user['id'],
                email=user['email'],
                name=user.get('name'),
                is_email_verified=user.get('is_email_verified', False),
                current_org_id=org_membership.get('org_id') if org_membership else None,
                current_org_role=org_membership.get('role') if org_membership else None
            )
            
        except Exception as e:
            logger.error(f"Get user error: {e}")
            return None
    
    # -------------------------------------------------------------------------
    # REFRESH TOKEN
    # -------------------------------------------------------------------------
    
    async def refresh_access_token(
        self,
        refresh_token: str
    ) -> Dict[str, Any]:
        """Generate new access token using refresh token."""
        payload = verify_token(refresh_token, expected_type='refresh')
        
        if not payload:
            return {
                'success': False,
                'error': 'INVALID_REFRESH_TOKEN',
                'message': 'Invalid or expired refresh token'
            }
        
        user_id = payload.get('sub')
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        
        try:
            # Verify session exists
            session = self.db.table('otp_console_sessions').select('id, user_id').eq(
                'refresh_token_hash', token_hash
            ).single().execute()
            
            if not session.data:
                return {
                    'success': False,
                    'error': 'SESSION_NOT_FOUND',
                    'message': 'Session expired or revoked'
                }
            
            # Get user's org
            org_result = self.db.table('otp_org_members').select('org_id').eq(
                'user_id', user_id
            ).limit(1).execute()
            
            org_id = org_result.data[0]['org_id'] if org_result.data else None
            
            # Generate new access token
            access_token = create_access_token(user_id, org_id)
            
            # Update session last used
            self.db.table('otp_console_sessions').update({
                'last_used_at': datetime.utcnow().isoformat()
            }).eq('id', session.data['id']).execute()
            
            return {
                'success': True,
                'access_token': access_token,
                'expires_in': JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
            }
            
        except Exception as e:
            logger.error(f"Refresh token error: {e}")
            return {
                'success': False,
                'error': 'REFRESH_FAILED',
                'message': 'Unable to refresh token'
            }
    
    # -------------------------------------------------------------------------
    # PRIVATE HELPERS
    # -------------------------------------------------------------------------
    
    def _is_valid_email(self, email: str) -> bool:
        """Basic email validation."""
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    def _validate_password(self, password: str) -> Dict[str, Any]:
        """Validate password strength."""
        if len(password) < 8:
            return {'valid': False, 'message': 'Password must be at least 8 characters'}
        if not any(c.isupper() for c in password):
            return {'valid': False, 'message': 'Password must contain uppercase letter'}
        if not any(c.islower() for c in password):
            return {'valid': False, 'message': 'Password must contain lowercase letter'}
        if not any(c.isdigit() for c in password):
            return {'valid': False, 'message': 'Password must contain a number'}
        return {'valid': True}
    
    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug."""
        import re
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')
        slug = f"{slug}-{secrets.token_hex(4)}"
        return slug[:100]
    
    async def _check_auth_rate_limit(
        self,
        ip_address: Optional[str],
        email: str,
        action: str
    ) -> Dict[str, Any]:
        """Check rate limits for auth actions."""
        now = datetime.utcnow()
        
        try:
            # Check IP rate limit (5/minute)
            if ip_address:
                ip_key = f"ip:{ip_address}:{action}"
                minute_ago = now - timedelta(minutes=1)
                
                ip_result = self.db.table('otp_auth_rate_limits').select('*').eq(
                    'key', ip_key
                ).gt('window_start', minute_ago.isoformat()).execute()
                
                if ip_result.data:
                    record = ip_result.data[0]
                    if record['attempt_count'] >= AUTH_RATE_LIMIT_IP_PER_MINUTE:
                        return {
                            'allowed': False,
                            'message': 'Too many attempts. Please try again later.',
                            'retry_after': 60
                        }
            
            # Check email rate limit (10/hour)
            email_key = f"email:{email}:{action}"
            hour_ago = now - timedelta(hours=1)
            
            email_result = self.db.table('otp_auth_rate_limits').select('*').eq(
                'key', email_key
            ).gt('window_start', hour_ago.isoformat()).execute()
            
            if email_result.data:
                record = email_result.data[0]
                if record['attempt_count'] >= AUTH_RATE_LIMIT_EMAIL_PER_HOUR:
                    return {
                        'allowed': False,
                        'message': 'Too many attempts for this email.',
                        'retry_after': 3600
                    }
            
            return {'allowed': True}
            
        except Exception as e:
            logger.warning(f"Rate limit check error: {e}")
            return {'allowed': True}  # Fail open
    
    async def _record_auth_attempt(
        self,
        ip_address: Optional[str],
        email: str,
        action: str,
        success: bool
    ) -> None:
        """Record auth attempt for rate limiting."""
        now = datetime.utcnow()
        
        try:
            # Record IP attempt
            if ip_address:
                ip_key = f"ip:{ip_address}:{action}"
                await self._increment_rate_limit(ip_key, now)
            
            # Record email attempt (only on failure)
            if not success:
                email_key = f"email:{email}:{action}"
                await self._increment_rate_limit(email_key, now)
                
        except Exception as e:
            logger.warning(f"Record auth attempt error: {e}")
    
    async def _increment_rate_limit(self, key: str, now: datetime) -> None:
        """Increment rate limit counter."""
        try:
            # Try to update existing
            result = self.db.table('otp_auth_rate_limits').select('id, attempt_count').eq(
                'key', key
            ).gt('window_start', (now - timedelta(hours=1)).isoformat()).execute()
            
            if result.data:
                record = result.data[0]
                self.db.table('otp_auth_rate_limits').update({
                    'attempt_count': record['attempt_count'] + 1
                }).eq('id', record['id']).execute()
            else:
                self.db.table('otp_auth_rate_limits').insert({
                    'key': key,
                    'window_start': now.isoformat(),
                    'attempt_count': 1
                }).execute()
        except Exception:
            pass
    
    async def _audit_log(
        self,
        user_id: str,
        org_id: Optional[str],
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> None:
        """Record audit log entry."""
        try:
            self.db.table('otp_console_audit_logs').insert({
                'user_id': user_id,
                'org_id': org_id,
                'action': action,
                'resource_type': resource_type,
                'resource_id': resource_id,
                'ip_address': ip_address,
                'metadata': metadata
            }).execute()
        except Exception as e:
            logger.warning(f"Audit log error: {e}")


# =============================================================================
# SINGLETON
# =============================================================================

_auth_service: Optional[ConsoleAuthService] = None


def get_console_auth_service() -> ConsoleAuthService:
    """Get or create console auth service."""
    global _auth_service
    
    if _auth_service is None:
        from supabase_client import get_supabase_client
        _auth_service = ConsoleAuthService(get_supabase_client())
    
    return _auth_service
