"""
Token Encryption/Decryption for WhatsApp Access Tokens
Matches the frontend encryption in lib/encryption/crypto.ts
Uses AES-256-GCM with format: iv:authTag:encryptedData (all hex encoded)
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from typing import Optional

# Get encryption key from environment
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY', '')

def decrypt_token(encrypted_text: str) -> Optional[str]:
    """
    Decrypt a string encrypted with the frontend encryptToken function.
    
    Args:
        encrypted_text: The encrypted string in format iv:authTag:encryptedData
        
    Returns:
        Decrypted plaintext or None if decryption fails
    """
    if not encrypted_text:
        print("⚠️ Encrypted text is empty")
        return None
    
    if not ENCRYPTION_KEY:
        print("⚠️ ENCRYPTION_KEY not set in environment")
        return None
        
    if len(ENCRYPTION_KEY) != 64:
        print(f"⚠️ ENCRYPTION_KEY invalid length: {len(ENCRYPTION_KEY)} (must be 64 hex characters)")
        return None
    
    try:
        # Split the encrypted text (format: iv:authTag:encryptedData)
        parts = encrypted_text.split(':')
        if len(parts) != 3:
            print(f"⚠️ Invalid encrypted text format (expected 3 parts, got {len(parts)})")
            print(f"   Parts: {parts[:2] if len(parts) > 1 else parts}")
            return None
        
        iv_hex, auth_tag_hex, encrypted_hex = parts
        print(f"🔍 IV length: {len(iv_hex)}, AuthTag length: {len(auth_tag_hex)}, Encrypted length: {len(encrypted_hex)}")
        
        # Convert from hex to bytes
        try:
            iv = bytes.fromhex(iv_hex)
            auth_tag = bytes.fromhex(auth_tag_hex)
            encrypted = bytes.fromhex(encrypted_hex)
            key = bytes.fromhex(ENCRYPTION_KEY)
        except ValueError as e:
            print(f"❌ Hex conversion error: {e}")
            return None
        
        print(f"🔍 Decoded - IV: {len(iv)} bytes, AuthTag: {len(auth_tag)} bytes, Encrypted: {len(encrypted)} bytes, Key: {len(key)} bytes")
        
        # AES-GCM expects the auth tag appended to the ciphertext
        ciphertext_with_tag = encrypted + auth_tag
        
        # Create AESGCM cipher and decrypt
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, ciphertext_with_tag, None)
        
        return decrypted.decode('utf-8')
        
    except Exception as e:
        print(f"❌ Decryption error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None


def encrypt_token(text: str) -> Optional[str]:
    """
    Encrypt a string using AES-256-GCM (same as frontend encryptToken).
    
    Args:
        text: The plaintext to encrypt
        
    Returns:
        Encrypted string in format iv:authTag:encryptedData or None if encryption fails
    """
    if not text:
        return None
    
    if not ENCRYPTION_KEY or len(ENCRYPTION_KEY) != 64:
        print("⚠️ ENCRYPTION_KEY not set or invalid (must be 64 hex characters)")
        return None
    
    try:
        import secrets
        
        # Generate random IV (16 bytes)
        iv = secrets.token_bytes(16)
        key = bytes.fromhex(ENCRYPTION_KEY)
        
        # Create AESGCM cipher and encrypt
        aesgcm = AESGCM(key)
        ciphertext_with_tag = aesgcm.encrypt(iv, text.encode('utf-8'), None)
        
        # Split ciphertext and auth tag (last 16 bytes is the tag)
        encrypted = ciphertext_with_tag[:-16]
        auth_tag = ciphertext_with_tag[-16:]
        
        # Return iv:authTag:encrypted (all hex encoded)
        return f"{iv.hex()}:{auth_tag.hex()}:{encrypted.hex()}"
        
    except Exception as e:
        print(f"❌ Encryption error: {e}")
        return None
