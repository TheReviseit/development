from sqlalchemy import Column, Integer, String, Text, ForeignKey, Float, Boolean, JSON, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class IntentDefinition(Base):
    __tablename__ = "intent_definitions"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    
    # Intent configuration
    intent_name = Column(String, nullable=False, index=True)  # appointment, pricing, support, ordering, faq
    display_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Training examples for AI classification
    training_examples = Column(JSON, default=list, nullable=True)
    # Example: ["I want to book appointment", "Can I schedule a visit?"]
    
    # Response templates
    response_templates = Column(JSON, default=list, nullable=True)
    # Example: ["Great! What time works best for you?", "I'd be happy to schedule that."]
    
    # Configuration
    confidence_threshold = Column(Float, default=0.7, nullable=False)  # 0.0 - 1.0
    requires_human_handoff = Column(Boolean, default=False, nullable=False)
    
    # Industry specific
    industry_tags = Column(JSON, default=list, nullable=True)  # ["restaurant", "clinic"]
    
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    business = relationship("Business", back_populates="intents")
