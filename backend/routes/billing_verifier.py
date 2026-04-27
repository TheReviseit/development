"""
Billing Accuracy Verifier
========================
FAANG-grade monthly billing audit.

Compares metering data against invoiced amounts to detect discrepancies
before charging customers.

@version 1.0.0
@securityLevel FAANG-Production
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum

from supabase_client import get_supabase_client

logger = logging.getLogger('reviseit.billing.verifier')


class VerificationStatus(Enum):
    VERIFIED = 'VERIFIED'
    DISCREPANCY = 'DISCREPANCY'
    UNDER_REVIEW = 'UNDER_REVIEW'


@dataclass
class VerificationResult:
    status: VerificationStatus
    tenant_id: str
    month: str
    expected_amount: int  # cents
    actual_amount: int  # cents
    discrepancy: int  # cents
    metered_usage: Dict[str, Any]
    requires_investigation: bool


class BillingAccuracyVerifier:
    """
    Verifies billing accuracy before invoicing customers.
    
    Pattern:
    1. Read metering source of truth
    2. Calculate expected bill from plan
    3. Compare against actual invoice
    4. Flag discrepancies for investigation
    5. Block invoicing if discrepancy > tolerance
    """
    
    TOLERANCE_CENTS = 1  # $0.01 tolerance for rounding
    
    def __init__(self):
        self.db = get_supabase_client()
    
    def verify_tenant_billing(
        self, 
        tenant_id: str, 
        month: str
    ) -> VerificationResult:
        """
        Verify billing accuracy for a single tenant.
        
        Args:
            tenant_id: Tenant to verify
            month: Month in format 'YYYY-MM'
            
        Returns:
            VerificationResult with status and details
        """
        try:
            # Get metered usage from Redis or database
            metered_usage = self._get_metered_usage(tenant_id, month)
            
            # Get tenant's plan
            plan = self._get_tenant_plan(tenant_id)
            
            # Calculate expected bill
            expected_amount = self._calculate_expected_bill(plan, metered_usage)
            
            # Get actual invoice (if exists)
            invoice = self._get_invoice(tenant_id, month)
            actual_amount = invoice['amount'] if invoice else 0
            
            # Compare
            discrepancy = abs(expected_amount - actual_amount)
            
            if discrepancy > self.TOLERANCE_CENTS:
                # CRITICAL: Discrepancy detected
                self._log_discrepancy(
                    tenant_id=tenant_id,
                    month=month,
                    expected=expected_amount,
                    actual=actual_amount,
                    discrepancy=discrepancy,
                    metered_usage=metered_usage,
                    plan=plan
                )
                
                # Block invoice from being sent
                self._flag_invoice_for_review(tenant_id, month)
                
                return VerificationResult(
                    status=VerificationStatus.DISCREPANCY,
                    tenant_id=tenant_id,
                    month=month,
                    expected_amount=expected_amount,
                    actual_amount=actual_amount,
                    discrepancy=discrepancy,
                    metered_usage=metered_usage,
                    requires_investigation=True
                )
            
            # Mark as verified
            self._mark_verified(tenant_id, month)
            
            return VerificationResult(
                status=VerificationStatus.VERIFIED,
                tenant_id=tenant_id,
                month=month,
                expected_amount=expected_amount,
                actual_amount=actual_amount,
                discrepancy=discrepancy,
                metered_usage=metered_usage,
                requires_investigation=False
            )
            
        except Exception as e:
            logger.error(f"Failed to verify tenant {tenant_id}: {e}")
            # Return as under review on error
            return VerificationResult(
                status=VerificationStatus.UNDER_REVIEW,
                tenant_id=tenant_id,
                month=month,
                expected_amount=0,
                actual_amount=0,
                discrepancy=0,
                metered_usage={},
                requires_investigation=True
            )
    
    def run_monthly_audit(self, month: Optional[str] = None) -> Dict[str, Any]:
        """
        Run billing verification audit for all active tenants.
        
        Args:
            month: Month to audit (default: previous month)
            
        Returns:
            Audit summary with statistics
        """
        if not month:
            # Default to previous month
            last_month = datetime.now() - timedelta(days=30)
            month = last_month.strftime('%Y-%m')
        
        # Get all active tenants
        tenants = self._get_active_tenants()
        
        verified = 0
        discrepancies = 0
        under_review = 0
        
        results = []
        
        for tenant in tenants:
            result = self.verify_tenant_billing(tenant['id'], month)
            results.append(result)
            
            if result.status == VerificationStatus.VERIFIED:
                verified += 1
            elif result.status == VerificationStatus.DISCREPANCY:
                discrepancies += 1
            else:
                under_review += 1
        
        total = len(tenants)
        accuracy_rate = (verified / total * 100) if total > 0 else 0
        
        summary = {
            'month': month,
            'total_tenants': total,
            'verified': verified,
            'discrepancies': discrepancies,
            'under_review': under_review,
            'accuracy_rate': round(accuracy_rate, 2),
            'results': results,
        }
        
        # Log summary
        logger.info(
            f"[BillingAudit] Month {month}: "
            f"{verified}/{total} verified, "
            f"{discrepancies} discrepancies, "
            f"accuracy={accuracy_rate:.2f}%"
        )
        
        # Alert if discrepancies found
        if discrepancies > 0:
            self._alert_discrepancies(summary)
        
        return summary
    
    def _get_metered_usage(self, tenant_id: str, month: str) -> Dict[str, Any]:
        """Get metered usage from database or Redis."""
        # Query from metered usage table
        result = self.db.table('metered_usage')\
            .select('*')\
            .eq('tenant_id', tenant_id)\
            .eq('month', month)\
            .execute()
        
        if result.data:
            return {
                'checkout_succeeded': sum(r.get('checkout_count', 0) for r in result.data),
                'api_calls': sum(r.get('api_calls', 0) for r in result.data),
                'storage_gb': sum(r.get('storage_gb', 0) for r in result.data),
            }
        
        return {'checkout_succeeded': 0, 'api_calls': 0, 'storage_gb': 0}
    
    def _get_tenant_plan(self, tenant_id: str) -> Dict[str, Any]:
        """Get tenant's current plan."""
        result = self.db.table('tenant_plans')\
            .select('*, plans(*)')\
            .eq('tenant_id', tenant_id)\
            .eq('status', 'active')\
            .single()\
            .execute()
        
        if result.data:
            return result.data.get('plans', {})
        
        return {'base_amount': 0, 'per_checkout': 0}
    
    def _calculate_expected_bill(self, plan: Dict, usage: Dict) -> int:
        """Calculate expected bill from plan and usage."""
        base_amount = plan.get('base_amount', 0)  # cents
        per_checkout = plan.get('per_checkout', 0)  # cents
        per_api_call = plan.get('per_api_call', 0)  # cents
        per_storage_gb = plan.get('per_storage_gb', 0)  # cents
        
        checkout_charge = usage.get('checkout_succeeded', 0) * per_checkout
        api_charge = usage.get('api_calls', 0) * per_api_call
        storage_charge = usage.get('storage_gb', 0) * per_storage_gb
        
        return base_amount + checkout_charge + api_charge + storage_charge
    
    def _get_invoice(self, tenant_id: str, month: str) -> Optional[Dict]:
        """Get invoice for tenant/month."""
        result = self.db.table('invoices')\
            .select('*')\
            .eq('tenant_id', tenant_id)\
            .eq('month', month)\
            .maybe_single()\
            .execute()
        
        return result.data if result.data else None
    
    def _log_discrepancy(
        self,
        tenant_id: str,
        month: str,
        expected: int,
        actual: int,
        discrepancy: int,
        metered_usage: Dict,
        plan: Dict
    ) -> None:
        """Log billing discrepancy for investigation."""
        self.db.table('billing_verification_logs').insert({
            'tenant_id': tenant_id,
            'month': month,
            'status': 'DISCREPANCY',
            'expected_amount': expected,
            'actual_amount': actual,
            'discrepancy_amount': discrepancy,
            'metered_usage': json.dumps(metered_usage),
            'plan_details': json.dumps(plan),
            'created_at': datetime.utcnow().isoformat(),
        }).execute()
        
        logger.critical(
            f"[BillingDiscrepancy] Tenant {tenant_id}, month {month}: "
            f"expected=${expected/100:.2f}, actual=${actual/100:.2f}, "
            f"discrepancy=${discrepancy/100:.2f}"
        )
    
    def _flag_invoice_for_review(self, tenant_id: str, month: str) -> None:
        """Flag invoice for manual review before sending."""
        self.db.table('invoices')\
            .update({'status': 'UNDER_REVIEW'})\
            .eq('tenant_id', tenant_id)\
            .eq('month', month)\
            .execute()
    
    def _mark_verified(self, tenant_id: str, month: str) -> None:
        """Mark invoice as verified."""
        self.db.table('billing_verification_logs').insert({
            'tenant_id': tenant_id,
            'month': month,
            'status': 'VERIFIED',
            'verified_at': datetime.utcnow().isoformat(),
        }).execute()
    
    def _get_active_tenants(self) -> List[Dict]:
        """Get list of active tenants."""
        result = self.db.table('tenants')\
            .select('id')\
            .eq('status', 'active')\
            .execute()
        
        return result.data if result.data else []
    
    def _alert_discrepancies(self, summary: Dict) -> None:
        """Send alert about billing discrepancies."""
        # This would integrate with Slack/PagerDuty
        message = (
            f"🚨 Billing Discrepancies Detected\n"
            f"Month: {summary['month']}\n"
            f"Total Tenants: {summary['total_tenants']}\n"
            f"Verified: {summary['verified']}\n"
            f"Discrepancies: {summary['discrepancies']}\n"
            f"Under Review: {summary['under_review']}\n"
            f"Accuracy: {summary['accuracy_rate']}%"
        )
        
        logger.critical(message)
        
        # TODO: Send to Slack/PagerDuty
        # slack.notify('#finance', message)


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

billing_verifier = BillingAccuracyVerifier()
