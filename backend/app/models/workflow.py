from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class Workflow(Base):
    __tablename__ = "workflows"
    
    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Workflow definition (JSON-based for flexibility)
    workflow_definition = Column(JSON, nullable=False)
    # Example structure:
    # {
    #   "trigger": {"type": "new_message", "conditions": {"intent": "new_lead"}},
    #   "actions": [
    #     {"type": "send_message", "template": "greeting", "delay": 0},
    #     {"type": "wait", "duration": 7200},  # 2 hours
    #     {"type": "send_message", "template": "follow_up"},
    #     {"type": "add_tag", "tag": "contacted"},
    #     {"type": "notify_admin", "channel": "email"}
    #   ],
    #   "conditions": [
    #     {"if": "no_reply", "wait": 86400, "then": "send_reminder"}
    #   ]
    # }
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Statistics
    execution_count = Column(Integer, default=0, nullable=False)
    last_executed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    business = relationship("Business", back_populates="workflows")
