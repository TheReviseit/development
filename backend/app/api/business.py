from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db import get_db
from app.models.business import Business
from app.models.business_user import BusinessUser, BusinessUserRole
from app.models.user import User
from app.schemas.business import (
    BusinessCreate, BusinessUpdate, BusinessResponse,
    WhatsAppCredentials, BusinessMemberResponse, InviteMember
)
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/businesses", tags=["Business Management"])


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
def create_business(
    business_data: BusinessCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new business workspace"""
    new_business = Business(
        name=business_data.name,
        description=business_data.description,
        industry=business_data.industry
    )
    
    db.add(new_business)
    db.commit()
    db.refresh(new_business)
    
    # Add creator as owner
    membership = BusinessUser(
        business_id=new_business.id,
        user_id=current_user.id,
        role=BusinessUserRole.OWNER
    )
    db.add(membership)
    db.commit()
    
    return new_business


@router.get("", response_model=List[BusinessResponse])
def list_my_businesses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all businesses the current user belongs to"""
    memberships = db.query(BusinessUser).filter(
        BusinessUser.user_id == current_user.id
    ).all()
    
    businesses = [membership.business for membership in memberships]
    return businesses


@router.get("/{business_id}", response_model=BusinessResponse)
def get_business(
    business_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get business details"""
    # Verify access
    membership = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id,
        BusinessUser.user_id == current_user.id
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    
    return business


@router.put("/{business_id}", response_model=BusinessResponse)
def update_business(
    business_id: int,
    business_data: BusinessUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update business information"""
    # Verify admin access
    membership = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id,
        BusinessUser.user_id == current_user.id,
        BusinessUser.role.in_([BusinessUserRole.OWNER, BusinessUserRole.ADMIN])
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    
    # Update fields
    if business_data.name is not None:
        business.name = business_data.name
    if business_data.description is not None:
        business.description = business_data.description
    if business_data.industry is not None:
        business.industry = business_data.industry
    
    db.commit()
    db.refresh(business)
    
    return business


@router.post("/{business_id}/whatsapp-credentials")
def configure_whatsapp(
    business_id: int,
    credentials: WhatsAppCredentials,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Configure WhatsApp Cloud API credentials"""
    # Verify admin access
    membership = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id,
        BusinessUser.user_id == current_user.id,
        BusinessUser.role.in_([BusinessUserRole.OWNER, BusinessUserRole.ADMIN])
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    
    # Update WhatsApp credentials
    business.whatsapp_phone_number_id = credentials.phone_number_id
    business.whatsapp_business_account_id = credentials.business_account_id
    business.whatsapp_access_token = credentials.access_token
    business.whatsapp_webhook_verify_token = credentials.webhook_verify_token
    business.whatsapp_connected = True
    
    db.commit()
    
    return {"message": "WhatsApp credentials configured successfully"}


@router.get("/{business_id}/members", response_model=List[BusinessMemberResponse])
def list_business_members(
    business_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all members of a business"""
    # Verify access
    membership = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id,
        BusinessUser.user_id == current_user.id
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    members = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id
    ).all()
    
    return [
        {
            "user_id": m.user.id,
            "user_email": m.user.email,
            "user_name": m.user.full_name,
            "role": m.role,
            "joined_at": m.joined_at
        }
        for m in members
    ]


@router.post("/{business_id}/invite")
def invite_member(
    business_id: int,
    invite_data: InviteMember,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Invite a user to the business"""
    # Verify admin access
    membership = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id,
        BusinessUser.user_id == current_user.id,
        BusinessUser.role.in_([BusinessUserRole.OWNER, BusinessUserRole.ADMIN])
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Find user by email
    invited_user = db.query(User).filter(User.email == invite_data.email).first()
    if not invited_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. They must register first."
        )
    
    # Check if already a member
    existing = db.query(BusinessUser).filter(
        BusinessUser.business_id == business_id,
        BusinessUser.user_id == invited_user.id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member"
        )
    
    # Add membership
    new_membership = BusinessUser(
        business_id=business_id,
        user_id=invited_user.id,
        role=invite_data.role
    )
    db.add(new_membership)
    db.commit()
    
    return {"message": f"User {invite_data.email} added successfully"}
