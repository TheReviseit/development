from celery import shared_task
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.campaign import Campaign, CampaignStatus
from app.models.customer import Customer
from app.models.followup import FollowUp, FollowUpStatus
from app.tasks.whatsapp_tasks import send_whatsapp_message
from datetime import datetime, timedelta


@shared_task(name="app.tasks.campaign_tasks.execute_campaign")
def execute_campaign(campaign_id: int):
    """Execute a campaign by sending messages to all targeted customers"""
    
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign or campaign.status != CampaignStatus.SCHEDULED:
            return {"error": "Campaign not found or not scheduled"}
        
        # Update status
        campaign.status = CampaignStatus.SENDING
        campaign.started_at = datetime.utcnow()
        db.commit()
        
        # Get target customers based on segment
        segment = campaign.target_segment or {}
        query = db.query(Customer).filter(Customer.business_id == campaign.business_id)
        
        # Apply filters
        if segment.get("tags"):
            # Filter by tags
            for tag in segment["tags"]:
                query = query.filter(Customer.tags.contains([tag]))
        
        if segment.get("lead_score"):
            from app.models.customer import LeadScore
            scores = [LeadScore(s) for s in segment["lead_score"]]
            query = query.filter(Customer.lead_score.in_(scores))
        
        if segment.get("last_activity"):
            # Filter by last activity (e.g., "7_days")
            days = int(segment["last_activity"].split("_")[0])
            cutoff = datetime.utcnow() - timedelta(days=days)
            query = query.filter(Customer.last_activity_at >= cutoff)
        
        customers = query.all()
        
        # Update recipients count
        campaign.total_recipients = len(customers)
        db.commit()
        
        # Send messages
        for customer in customers:
            try:
                result = send_whatsapp_message.delay(
                    business_id=campaign.business_id,
                    customer_phone=customer.phone_number,
                    message_text=campaign.message_template
                )
                campaign.sent_count += 1
            except Exception as e:
                campaign.failed_count += 1
                print(f"Failed to send to {customer.phone_number}: {e}")
            
            db.commit()
        
        # Mark campaign as completed
        campaign.status = CampaignStatus.COMPLETED
        campaign.completed_at = datetime.utcnow()
        db.commit()
        
        return {
            "status": "completed",
            "total": campaign.total_recipients,
            "sent": campaign.sent_count,
            "failed": campaign.failed_count
        }
    
    except Exception as e:
        if campaign:
            campaign.status = CampaignStatus.FAILED
            db.commit()
        return {"error": str(e)}
    
    finally:
        db.close()


@shared_task(name="app.tasks.campaign_tasks.check_and_schedule_followups")
def check_and_schedule_followups():
    """Check for customers needing follow-ups and schedule them"""
    
    db = SessionLocal()
    try:
        from app.models.message import Message, MessageDirection
        
        # Find customers with no recent activity (last 24h)
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)
        cutoff_1h = datetime.utcnow() - timedelta(hours=1)
        
        # Get customers who messaged us but we haven't replied in 2h
        # (This is a simplified version - you'd want more sophisticated logic)
        
        # Find pending follow-ups that are due
        due_followups = db.query(FollowUp).filter(
            FollowUp.status == FollowUpStatus.PENDING,
            FollowUp.scheduled_at <= datetime.utcnow()
        ).all()
        
        for followup in due_followups:
            try:
                # Send follow-up message
                send_whatsapp_message.delay(
                    business_id=followup.customer.business_id,
                    customer_phone=followup.customer.phone_number,
                    message_text=followup.message_template
                )
                
                # Mark as sent
                followup.status = FollowUpStatus.SENT
                followup.sent_at = datetime.utcnow()
                db.commit()
            
            except Exception as e:
                print(f"Failed to send follow-up: {e}")
        
        return {"processed": len(due_followups)}
    
    finally:
        db.close()
