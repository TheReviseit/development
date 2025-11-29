from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class Business(Base):
    __tablename__ = "businesses"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    industry = Column(String, nullable=True)  # restaurant, clinic, real_estate, ecommerce, salon
    
    # WhatsApp Cloud API Credentials
    whatsapp_phone_number_id = Column(String, nullable=True)
    whatsapp_business_account_id = Column(String, nullable=True)
    whatsapp_access_token = Column(String, nullable=True)
    whatsapp_webhook_verify_token = Column(String, nullable=True)
    whatsapp_connected = Column(Boolean, default=False, nullable=False)
    
    # Business profile for AI context
    business_profile = Column(JSON, nullable=True)  # Store FAQs, services, opening hours, etc.
    
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    members = relationship("BusinessUser", back_populates="business", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="business", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="business", cascade="all, delete-orphan")
    automation_rules = relationship("AutomationRule", back_populates="business", cascade="all, delete-orphan")
    intents = relationship("IntentDefinition", back_populates="business", cascade="all, delete-orphan")
    workflows = relationship("Workflow", back_populates="business", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="business", cascade="all, delete-orphan")
