from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.business_user import BusinessUserRole


# Business Schemas
class BusinessCreate(BaseModel):
    name: str
    description: Optional[str] = None
    industry: Optional[str] = None  # restaurant, clinic, real_estate, ecommerce, salon


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None


class WhatsAppCredentials(BaseModel):
    phone_number_id: str
    business_account_id: str
    access_token: str
    webhook_verify_token: str


class BusinessResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    industry: Optional[str]
    whatsapp_connected: bool
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class BusinessMemberResponse(BaseModel):
    user_id: int
    user_email: str
    user_name: str
    role: BusinessUserRole
    joined_at: datetime


class InviteMember(BaseModel):
    email: str
    role: BusinessUserRole = BusinessUserRole.MEMBER
