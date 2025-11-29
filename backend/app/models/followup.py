from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db import Base


class FollowUpStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    SKIPPED = "skipped"  # Customer replied before follow-up


class FollowUp(Base):
    __tablename__ = "followups"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    
    # Follow-up configuration
    trigger_message_id = Column(Integer, nullable=True)  # Message that triggered this follow-up
    schedule_type = Column(String, nullable=False)  # 1h, 24h, 48h
    scheduled_at = Column(DateTime, nullable=False, index=True)
    
    # Message content
    message_template = Column(String, nullable=False)
    
    # Status
    status = Column(SQLEnum(FollowUpStatus), default=FollowUpStatus.PENDING, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    customer = relationship("Customer", back_populates="followups")
