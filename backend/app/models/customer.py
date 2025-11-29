from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, Float, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db import Base


class LeadScore(str, enum.Enum):
    COLD = "cold"
    WARM = "warm"
    HOT = "hot"


class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    
    # Customer information
    phone_number = Column(String, nullable=False, index=True)  # WhatsApp phone number
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    
    # CRM fields
    tags = Column(JSON, default=list, nullable=True)  # ["new_lead", "interested", "vip"]
    notes = Column(Text, nullable=True)
    
    # AI Conversation Memory (short-term + long-term)
    conversation_memory = Column(JSON, default=dict, nullable=True)
    # Example: {
    #   "attributes": {"appointment_preference": "morning", "budget": "high"},
    #   "preferences": {"communication_style": "formal"},
    #   "history_summary": "Interested in premium package"
    # }
    
    # Lead scoring
    lead_score = Column(SQLEnum(LeadScore), default=LeadScore.COLD, nullable=True)
    score_value = Column(Float, default=0.0, nullable=True)  # 0-100
    
    # Segmentation
    funnel_stage = Column(String, nullable=True)  # awareness, consideration, decision, customer
    last_activity_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    business = relationship("Business", back_populates="customers")
    messages = relationship("Message", back_populates="customer", cascade="all, delete-orphan")
    followups = relationship("FollowUp", back_populates="customer", cascade="all, delete-orphan")
