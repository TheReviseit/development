"""
Invoice Generation Tests
ENTERPRISE-GRADE: Deterministic, isolated, no side effects.

Tests:
1. Payment labels (COD, PAID, PENDING)
2. Invoice number generation
3. PDF generation produces valid bytes
"""

import pytest
from unittest.mock import patch, MagicMock

# Import invoice generator
from utils.invoice_generator import (
    generate_invoice_pdf,
    generate_invoice_number,
    get_payment_label,
    format_price_inr,
)


# =============================================================================
# Test Data
# =============================================================================

SAMPLE_BUSINESS = {
    "businessName": "Test Store",
    "brandColor": "#22c55e",
    "logoUrl": None,
    "phone": "+91 9876543210",
    "address": "123 Test Street",
    "location": {
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
    },
    "storeSlug": "test-store",
}

SAMPLE_ORDER_COD = {
    "id": "uuid-12345678-abcd-efgh",
    "order_id": "ABC12345",
    "customer_name": "Test Customer",
    "customer_phone": "9876543210",
    "customer_email": "test@example.com",
    "delivery_address": "456 Customer Street, Mumbai",
    "items": [
        {"name": "Product 1", "quantity": 2, "price": 500, "size": "M", "color": "Red"},
        {"name": "Product 2", "quantity": 1, "price": 1000},
    ],
    "total_amount": 2000,
    "shipping": 0,
    "payment_method": "cod",
    "payment_status": "pending",
    "created_at": "2024-01-15T10:30:00Z",
}

SAMPLE_ORDER_PAID = {
    **SAMPLE_ORDER_COD,
    "payment_method": "online",
    "payment_status": "paid",
}

SAMPLE_ORDER_PENDING = {
    **SAMPLE_ORDER_COD,
    "payment_method": "online",
    "payment_status": "pending",
}


# =============================================================================
# Invoice Number Tests
# =============================================================================

class TestInvoiceNumberGeneration:
    """Tests for invoice number generation."""
    
    def test_invoice_number_format(self):
        """Invoice number should be INV-{8chars}."""
        invoice_num = generate_invoice_number("ABC12345")
        assert invoice_num.startswith("INV-")
        assert len(invoice_num) == 12  # INV- + 8 chars
    
    def test_invoice_number_deterministic(self):
        """Same input should produce same invoice number."""
        num1 = generate_invoice_number("ORDER123")
        num2 = generate_invoice_number("ORDER123")
        assert num1 == num2
    
    def test_invoice_number_uppercase(self):
        """Invoice number should be uppercase."""
        invoice_num = generate_invoice_number("abc12345")
        assert invoice_num == invoice_num.upper()


# =============================================================================
# Payment Label Tests
# =============================================================================

class TestPaymentLabel:
    """Tests for payment label derivation."""
    
    def test_invoice_generation_cod(self):
        """COD orders show 'CASH ON DELIVERY' label."""
        order = {"payment_method": "cod", "payment_status": "pending"}
        label = get_payment_label(order)
        assert label == "CASH ON DELIVERY"
    
    def test_invoice_generation_paid(self):
        """Online paid orders show 'PAID ONLINE' label."""
        order = {"payment_method": "online", "payment_status": "paid"}
        label = get_payment_label(order)
        assert label == "PAID ONLINE"
    
    def test_invoice_generation_pending(self):
        """Pending online orders show 'PAYMENT PENDING' label."""
        order = {"payment_method": "online", "payment_status": "pending"}
        label = get_payment_label(order)
        assert label == "PAYMENT PENDING"
    
    def test_cod_takes_precedence(self):
        """COD method takes precedence over paid status."""
        order = {"payment_method": "cod", "payment_status": "paid"}
        label = get_payment_label(order)
        assert label == "CASH ON DELIVERY"


# =============================================================================
# PDF Generation Tests
# =============================================================================

class TestPDFGeneration:
    """Tests for PDF generation."""
    
    def test_generate_pdf_returns_bytes(self):
        """PDF generation should return bytes."""
        pdf_bytes = generate_invoice_pdf(SAMPLE_ORDER_COD, SAMPLE_BUSINESS)
        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 0
    
    def test_pdf_starts_with_pdf_header(self):
        """Generated PDF should have valid PDF header."""
        pdf_bytes = generate_invoice_pdf(SAMPLE_ORDER_COD, SAMPLE_BUSINESS)
        # PDF files start with %PDF-
        assert pdf_bytes[:5] == b'%PDF-'
    
    def test_pdf_generation_deterministic(self):
        """Same input should produce same PDF size (approximately)."""
        pdf1 = generate_invoice_pdf(SAMPLE_ORDER_COD, SAMPLE_BUSINESS)
        pdf2 = generate_invoice_pdf(SAMPLE_ORDER_COD, SAMPLE_BUSINESS)
        # Size should be within 1% of each other (timestamps may vary slightly)
        size_diff = abs(len(pdf1) - len(pdf2))
        assert size_diff < len(pdf1) * 0.01
    
    def test_pdf_with_all_payment_types(self):
        """PDF generation works for all payment types."""
        for order in [SAMPLE_ORDER_COD, SAMPLE_ORDER_PAID, SAMPLE_ORDER_PENDING]:
            pdf_bytes = generate_invoice_pdf(order, SAMPLE_BUSINESS)
            assert isinstance(pdf_bytes, bytes)
            assert len(pdf_bytes) > 0


# =============================================================================
# Price Formatting Tests
# =============================================================================

class TestPriceFormatting:
    """Tests for price formatting."""
    
    def test_format_price_inr(self):
        """Price should be formatted as Rs. X,XXX."""
        assert format_price_inr(1000) == "Rs. 1,000"
        assert format_price_inr(100) == "Rs. 100"
        assert format_price_inr(10000) == "Rs. 10,000"
        # Note: Python's default formatting uses standard comma grouping
        assert format_price_inr(100000) == "Rs. 100,000"
    
    def test_format_price_zero(self):
        """Zero price should format correctly."""
        assert format_price_inr(0) == "Rs. 0"


# =============================================================================
# Idempotency Tests
# =============================================================================

class TestIdempotency:
    """Tests for idempotent behavior."""
    
    def test_invoice_number_derived_from_order_id(self):
        """Invoice number is generated from order_id, not random."""
        order = {"order_id": "ABC123", "id": "uuid-xyz"}
        invoice_num = generate_invoice_number(order.get("order_id", order.get("id")))
        assert "ABC123" in invoice_num or invoice_num.endswith("ABC123")


# =============================================================================
# WhatsApp Media Service Tests (Mocked)
# =============================================================================

class TestWhatsAppMediaService:
    """Tests for WhatsApp media service."""
    
    @patch('services.whatsapp_media.requests.post')
    def test_upload_document_success(self, mock_post):
        """Document upload should return media_id on success."""
        from services.whatsapp_media import upload_document
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "media_123"}
        mock_post.return_value = mock_response
        
        result = upload_document(
            phone_number_id="123456",
            access_token="test_token",
            pdf_bytes=b"test pdf content",
            filename="test.pdf"
        )
        
        assert result == "media_123"
    
    @patch('services.whatsapp_media.requests.post')
    def test_send_document_success(self, mock_post):
        """Document send should return success on valid request."""
        from services.whatsapp_media import send_document_message
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "messages": [{"id": "msg_123"}]
        }
        mock_post.return_value = mock_response
        
        result = send_document_message(
            phone_number_id="123456",
            access_token="test_token",
            to="9876543210",
            media_id="media_123",
            filename="invoice.pdf",
            caption="Test caption"
        )
        
        assert result["success"] is True
        assert result["message_id"] == "msg_123"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
