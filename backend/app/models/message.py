from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db import Base


class MessageDirection(str, enum.Enum):
    INBOUND = "inbound"  # Customer to Business
    OUTBOUND = "outbound"  # Business to Customer


class MessageStatus(str, enum.Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class MessageType(str, enum.Enum):
    TEXT = "text"
    TEMPLATE = "template"
    BUTTON_REPLY = "button_reply"
    QUICK_REPLY = "quick_reply"
    MEDIA = "media"


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    
    # Message details
    whatsapp_message_id = Column(String, unique=True, index=True, nullable=True)
    direction = Column(SQLEnum(MessageDirection), nullable=False)
    message_type = Column(SQLEnum(MessageType), default=MessageType.TEXT, nullable=False)
    
    content = Column(Text, nullable=False)
    metadata = Column(JSON, nullable=True)  # Store buttons, media URLs, template data, etc.
    
    # Status tracking
    status = Column(SQLEnum(MessageStatus), default=MessageStatus.SENT, nullable=True)
    
    # AI Context
    detected_intent = Column(String, nullable=True)  # appointment, pricing, support, etc.
    intent_confidence = Column(Integer, nullable=True)  # 0-100
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    business = relationship("Business", back_populates="messages")
    customer = relationship("Customer", back_populates="messages")
