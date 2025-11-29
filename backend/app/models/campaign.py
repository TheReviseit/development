from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db import Base


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    COMPLETED = "completed"
    FAILED = "failed"


class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Message content
    message_template = Column(Text, nullable=False)
    message_type = Column(String, default="text", nullable=False)  # text, template
    
    # Audience segmentation
    target_segment = Column(JSON, nullable=True)
    # Example: {"tags": ["vip"], "lead_score": ["hot", "warm"], "last_activity": "7_days"}
    
    # Scheduling
    scheduled_at = Column(DateTime, nullable=True)
    status = Column(SQLEnum(CampaignStatus), default=CampaignStatus.DRAFT, nullable=False)
    
    # Statistics
    total_recipients = Column(Integer, default=0, nullable=True)
    sent_count = Column(Integer, default=0, nullable=True)
    delivered_count = Column(Integer, default=0, nullable=True)
    failed_count = Column(Integer, default=0, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    business = relationship("Business", back_populates="campaigns")
