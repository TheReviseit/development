# Import all models for Alembic migrations
from app.models.user import User, UserRole
from app.models.business import Business
from app.models.business_user import BusinessUser, BusinessUserRole
from app.models.customer import Customer, LeadScore
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.models.automation_rule import AutomationRule
from app.models.intent import IntentDefinition
from app.models.workflow import Workflow
from app.models.campaign import Campaign, CampaignStatus
from app.models.followup import FollowUp, FollowUpStatus

__all__ = [
    "User",
    "UserRole",
    "Business",
    "BusinessUser",
    "BusinessUserRole",
    "Customer",
    "LeadScore",
    "Message",
    "MessageDirection",
    "MessageStatus",
    "MessageType",
    "AutomationRule",
    "IntentDefinition",
    "Workflow",
    "Campaign",
    "CampaignStatus",
    "FollowUp",
    "FollowUpStatus",
]
