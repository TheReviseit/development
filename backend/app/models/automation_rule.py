from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class AutomationRule(Base):
    __tablename__ = "automation_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Trigger configuration
    trigger_type = Column(String, default="keyword", nullable=False)  # keyword, exact_match, contains
    trigger_keywords = Column(JSON, default=list, nullable=False)  # ["pricing", "price", "cost"]
    
    # Response configuration
    response_template = Column(Text, nullable=False)
    response_delay_seconds = Column(Integer, default=0, nullable=True)  # Delay before sending response
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    priority = Column(Integer, default=0, nullable=False)  # Higher priority runs first
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    business = relationship("Business", back_populates="automation_rules")
