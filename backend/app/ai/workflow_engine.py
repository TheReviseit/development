from sqlalchemy.orm import Session
from app.models.workflow import Workflow
from app.models.customer import Customer
from app.tasks.whatsapp_tasks import send_whatsapp_message
from typing import Dict, Any
from datetime import datetime, timedelta


class WorkflowEngine:
    """Execute workflow automation"""
    
    def __init__(self, db: Session, business):
        self.db = db
        self.business = business
    
    async def execute_workflow(self, workflow: Workflow, customer: Customer, trigger_data: Dict[str, Any] = None):
        """Execute workflow actions"""
        
        definition = workflow.workflow_definition
        
        # Verify trigger matches
        trigger = definition.get("trigger", {})
        if not self._check_trigger(trigger, trigger_data):
            return
        
        # Execute actions sequentially
        actions = definition.get("actions", [])
        
        for action in actions:
            await self._execute_action(action, customer, workflow)
        
        # Update statistics
        workflow.execution_count += 1
        workflow.last_executed_at = datetime.utcnow()
        self.db.commit()
    
    def _check_trigger(self, trigger: dict, trigger_data: dict) -> bool:
        """Check if trigger conditions are met"""
        
        trigger_type = trigger.get("type")
        conditions = trigger.get("conditions", {})
        
        if trigger_type == "new_message":
            intent_required = conditions.get("intent")
            if intent_required and trigger_data:
                return trigger_data.get("intent") == intent_required
            return True
        
        # Add more trigger types as needed
        return True
    
    async def _execute_action(self, action: dict, customer: Customer, workflow: Workflow):
        """Execute single workflow action"""
        
        action_type = action.get("type")
        
        if action_type == "send_message":
            template = action.get("template", "")
            delay = action.get("delay", 0)
            
            # Replace placeholders
            message = template.replace("{name}", customer.name or "there")
            
            # Schedule message
            send_whatsapp_message.apply_async(
                args=[self.business.id, customer.phone_number, message],
                countdown=delay
            )
        
        elif action_type == "wait":
            duration = action.get("duration", 0)
            # In a real implementation, this would schedule the next action
            pass
        
        elif action_type == "add_tag":
            tag = action.get("tag")
            if tag:
                if not customer.tags:
                    customer.tags = []
                if tag not in customer.tags:
                    customer.tags.append(tag)
                self.db.commit()
        
        elif action_type == "notify_admin":
            # TODO: Implement admin notifications (email, Slack, etc.)
            pass
