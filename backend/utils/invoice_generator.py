"""
Invoice PDF Generator - PURE FUNCTION
No side effects, no database, no filesystem, no WhatsApp.
Same input → same PDF bytes.

Enterprise-grade, deterministic, testable.
"""

import io
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import requests
import qrcode

logger = logging.getLogger('reviseit.utils.invoice')

# =============================================================================
# Configuration (Future-proof toggle)
# =============================================================================

INVOICE_STORAGE_MODE = "NONE"  # Future: "SUPABASE" / "S3"


# =============================================================================
# Invoice Number Generation
# =============================================================================

def generate_invoice_number(order_id: str) -> str:
    """
    Generate deterministic invoice number from order_id.
    
    Format: INV-{order_id}
    """
    # Use first 8 chars of order_id for readability
    short_id = order_id.replace("-", "").upper()[:8]
    return f"INV-{short_id}"


# =============================================================================
# Payment Label Logic
# =============================================================================

def get_payment_label(order: Dict[str, Any]) -> str:
    """
    WORLD-CLASS Payment Detection - Enterprise-Grade Logic
    
    Derives payment label from ALL available sources in priority order:
    
    1. Explicit payment_method/payment_status fields
    2. Notes field parsing (e.g., "PAID via Razorpay", "Payment: COD")
    3. Order status inference
    4. Source-based inference
    
    Returns:
        "PAID ONLINE" | "CASH ON DELIVERY" | "PAYMENT PENDING"
    """
    # =================================================================
    # LAYER 1: Check explicit payment fields (highest priority)
    # =================================================================
    payment_method = order.get("payment_method", "").lower()
    payment_status = (
        order.get("payment_status", "") or 
        order.get("razorpay_payment_status", "") or
        ""
    ).lower()
    
    # Explicit COD
    if payment_method == "cod":
        return "CASH ON DELIVERY"
    
    # Explicit paid status
    if payment_status in ("paid", "captured", "completed", "success"):
        return "PAID ONLINE"
    
    # =================================================================
    # LAYER 2: Parse notes field for payment indicators
    # AI Brain stores payment info in notes like:
    # - "PAID via Razorpay: ₹500"
    # - "Payment: COD (Cash on Delivery)"
    # =================================================================
    notes = order.get("notes", "") or ""
    notes_lower = notes.lower()
    
    # Check for Razorpay/online payment indicators
    if any(indicator in notes_lower for indicator in [
        "paid via razorpay",
        "paid online", 
        "payment successful",
        "razorpay payment",
        "online payment",
        "upi payment",
        "card payment",
    ]):
        return "PAID ONLINE"
    
    # Check for COD indicators
    if any(indicator in notes_lower for indicator in [
        "payment: cod",
        "cash on delivery",
        "pay on delivery",
        "cod order",
    ]):
        return "CASH ON DELIVERY"
    
    # =================================================================
    # LAYER 3: Order status inference
    # If order is confirmed/processing/shipped, payment must be done
    # =================================================================
    order_status = order.get("status", "").lower()
    
    if order_status in ("confirmed", "processing", "shipped", "delivered", "completed"):
        # For AI/online source, confirmed means paid
        source = order.get("source", "").lower()
        if source in ("ai", "online", "webhook", "api"):
            return "PAID ONLINE"
        # For COD source specifically
        if source == "cod":
            return "CASH ON DELIVERY"
        # For manual orders with confirmed status, assume paid unless explicit
        if source == "manual" and order_status != "pending":
            return "PAID ONLINE"
    
    # =================================================================
    # LAYER 4: Fallback - Payment Pending
    # =================================================================
    return "PAYMENT PENDING"


def get_payment_badge_color(order: Dict[str, Any], brand_color: str) -> str:
    """Get badge color based on payment method."""
    payment_method = order.get("payment_method", "").lower()
    
    if payment_method == "cod":
        return "#f59e0b"  # Amber for COD
    
    return brand_color  # Brand color for paid/pending


# =============================================================================
# Utility Functions
# =============================================================================

def format_price_inr(price: float) -> str:
    """Format price in Indian Rupees."""
    return f"Rs. {price:,.0f}"


def format_date(date_str: str) -> str:
    """Format date for invoice display."""
    try:
        if isinstance(date_str, str):
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        else:
            dt = date_str
        return dt.strftime("%d %b %Y")
    except Exception:
        return datetime.now().strftime("%d %b %Y")


def hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple (0-1 range)."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))


# =============================================================================
# PDF Generation (PURE FUNCTION)
# =============================================================================

def generate_invoice_pdf(order: Dict[str, Any], business: Dict[str, Any]) -> bytes:
    """
    PURE FUNCTION - Generate invoice PDF.
    
    - No DB calls
    - No filesystem access
    - No WhatsApp logic
    - Same input → same PDF bytes
    
    Args:
        order: Order data dict with keys:
            - id: UUID
            - order_id: Short human-readable ID
            - customer_name, customer_phone, customer_email, delivery_address
            - items: List of {name, quantity, price, size, color}
            - total_amount, shipping (optional)
            - payment_method, payment_status
            - created_at
        business: Business data dict with keys:
            - businessName, logoUrl, phone, address, brandColor
            
    Returns:
        PDF bytes
    """
    # Create buffer
    buffer = io.BytesIO()
    
    # Page setup
    width, height = A4
    c = canvas.Canvas(buffer, pagesize=A4)
    
    # Extract business info
    brand_color = business.get("brandColor", "#22c55e")
    business_name = business.get("businessName", "Store")
    business_phone = business.get("contact", {}).get("phone", "") if isinstance(business.get("contact"), dict) else business.get("phone", "")
    business_address = _get_business_address(business)
    logo_url = business.get("logoUrl", "")
    store_slug = business.get("storeSlug") or business.get("businessId", "")
    
    # Extract order info
    invoice_number = generate_invoice_number(order.get("order_id", order.get("id", "UNKNOWN")))
    order_id = order.get("order_id", order.get("id", ""))
    order_date = order.get("created_at", datetime.now().isoformat())
    
    # Customer info
    customer_name = order.get("customer_name", "Customer")
    customer_phone = order.get("customer_phone", "")
    customer_email = order.get("customer_email", "")
    # Try multiple possible address fields
    customer_address = (
        order.get("delivery_address") or 
        order.get("customer_address") or 
        order.get("address") or 
        ""
    )
    
    # Items
    items = order.get("items", [])
    
    # Totals
    subtotal = sum(item.get("price", 0) * item.get("quantity", 1) for item in items)
    shipping = order.get("shipping", 0) or 0
    total = order.get("total_amount", subtotal + shipping)
    
    # Payment
    payment_label = get_payment_label(order)
    payment_color = get_payment_badge_color(order, brand_color)
    
    # Y position tracker (start from top)
    y = height - 30 * mm
    
    # ==========================================================================
    # HEADER (Brand colored background)
    # ==========================================================================
    header_height = 25 * mm
    _draw_header(c, width, height, brand_color, business_name, business_phone, 
                 business_address, logo_url, header_height)
    
    y = height - header_height - 15 * mm
    
    # ==========================================================================
    # BILL TO Section
    # ==========================================================================
    y = _draw_bill_to(c, y, customer_name, customer_phone, customer_email, customer_address)
    
    # ==========================================================================
    # Invoice Meta (Badge + Number + Date)
    # ==========================================================================
    y = _draw_invoice_meta(c, y, width, brand_color, invoice_number, order_date)
    
    # ==========================================================================
    # Items Table
    # ==========================================================================
    y = _draw_items_table(c, y, width, items)
    
    # ==========================================================================
    # Totals Section (with QR code)
    # ==========================================================================
    y = _draw_totals_section(c, y, width, subtotal, shipping, total, store_slug)
    
    # ==========================================================================
    # Footer
    # ==========================================================================
    _draw_footer(c, width, payment_label, payment_color, order_id)
    
    # Finalize
    c.save()
    buffer.seek(0)
    
    return buffer.read()


# =============================================================================
# Drawing Helper Functions
# =============================================================================

def _get_business_address(business: Dict[str, Any]) -> str:
    """Build business address from location fields."""
    location = business.get("location", {})
    if isinstance(location, dict):
        parts = [
            location.get("address", ""),
            location.get("city", ""),
            location.get("state", ""),
            location.get("pincode", "")
        ]
        return ", ".join(filter(None, parts))
    return business.get("address", "")


def _draw_header(c, width, height, brand_color, business_name, phone, address, logo_url, header_height):
    """Draw branded header section."""
    # Background
    c.setFillColor(HexColor(brand_color))
    c.rect(0, height - header_height, width, header_height, fill=True, stroke=False)
    
    # Business name
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, height - 12 * mm, business_name)
    
    # Contact details
    c.setFont("Helvetica", 9)
    if phone:
        c.drawString(20 * mm, height - 17 * mm, phone)
    if address:
        # Truncate long addresses
        addr_display = address[:60] + "..." if len(address) > 60 else address
        c.drawString(20 * mm, height - 21 * mm, addr_display)
    
    # Logo (right side)
    logo_x = width - 25 * mm
    logo_y = height - 20 * mm
    logo_size = 15 * mm
    
    # Try to load logo from URL
    logo_loaded = False
    if logo_url:
        try:
            response = requests.get(logo_url, timeout=5)
            if response.status_code == 200:
                logo_buffer = io.BytesIO(response.content)
                logo_image = ImageReader(logo_buffer)
                
                # Draw circular clip mask (white background)
                c.setFillColor(white)
                c.circle(logo_x, logo_y, logo_size / 2 + 1, fill=True, stroke=False)
                
                # Draw the logo (centered)
                c.drawImage(
                    logo_image,
                    logo_x - logo_size / 2,
                    logo_y - logo_size / 2,
                    width=logo_size,
                    height=logo_size,
                    mask='auto',
                    preserveAspectRatio=True,
                    anchor='c'
                )
                logo_loaded = True
                logger.debug(f"Logo loaded successfully from {logo_url[:50]}...")
        except Exception as e:
            logger.warning(f"Failed to load logo from URL: {e}")
    
    # Fallback: Draw circle with first letter if logo failed
    if not logo_loaded:
        c.setFillColor(white)
        c.circle(logo_x, logo_y, logo_size / 2, fill=True, stroke=False)
        c.setFillColor(HexColor(brand_color))
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(logo_x, logo_y - 4, business_name[0].upper())


def _draw_bill_to(c, y, name, phone, email, address):
    """Draw Bill To section."""
    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(20 * mm, y, "BILL TO")
    
    y -= 5 * mm
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, name)
    
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#666666"))
    
    y -= 4 * mm
    if phone:
        c.drawString(20 * mm, y, phone)
        y -= 3.5 * mm
    
    if email:
        c.drawString(20 * mm, y, email)
        y -= 3.5 * mm
    
    if address:
        # Handle multi-line address
        addr_lines = _wrap_text(address, 50)
        for line in addr_lines[:2]:  # Max 2 lines
            c.drawString(20 * mm, y, line)
            y -= 3.5 * mm
    
    return y - 5 * mm


def _draw_invoice_meta(c, y, width, brand_color, invoice_number, order_date):
    """Draw invoice badge, number and date."""
    # Invoice badge
    badge_width = 18 * mm
    badge_height = 5 * mm
    badge_x = 20 * mm
    
    c.setFillColor(HexColor(brand_color))
    c.roundRect(badge_x, y - badge_height, badge_width, badge_height, 2, fill=True, stroke=False)
    
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(badge_x + badge_width / 2, y - badge_height + 1.5, "INVOICE")
    
    # Invoice number and date
    c.setFillColor(HexColor("#666666"))
    c.setFont("Helvetica", 9)
    date_str = format_date(order_date)
    c.drawString(badge_x + badge_width + 5 * mm, y - badge_height + 1.5, 
                 f"#{invoice_number} • {date_str}")
    
    return y - 12 * mm


def _draw_items_table(c, y, width, items):
    """Draw items table."""
    # Table dimensions
    left_margin = 20 * mm
    table_width = width - 40 * mm
    row_height = 8 * mm
    
    # Column widths (percentage of table width)
    col_widths = [0.08, 0.50, 0.12, 0.15, 0.15]  # S.No, Product, Qty, Price, Total
    col_positions = [left_margin]
    for w in col_widths[:-1]:
        col_positions.append(col_positions[-1] + w * table_width)
    
    # Header row
    c.setFillColor(HexColor("#f9fafb"))
    c.rect(left_margin, y - row_height, table_width, row_height, fill=True, stroke=False)
    
    # Header border
    c.setStrokeColor(HexColor("#eeeeee"))
    c.setLineWidth(0.5)
    c.rect(left_margin, y - row_height, table_width, row_height, fill=False, stroke=True)
    
    # Header text
    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica-Bold", 7)
    headers = ["S.No", "Product", "Qty", "Price", "Total"]
    header_y = y - row_height + 2.5 * mm
    
    c.drawCentredString(col_positions[0] + col_widths[0] * table_width / 2, header_y, headers[0])
    c.drawString(col_positions[1] + 2 * mm, header_y, headers[1])
    c.drawCentredString(col_positions[2] + col_widths[2] * table_width / 2, header_y, headers[2])
    c.drawRightString(col_positions[3] + col_widths[3] * table_width - 2 * mm, header_y, headers[3])
    c.drawRightString(col_positions[4] + col_widths[4] * table_width - 2 * mm, header_y, headers[4])
    
    y -= row_height
    
    # Item rows
    for idx, item in enumerate(items[:10]):  # Max 10 items per page
        item_row_height = 10 * mm
        
        # Row border
        c.setStrokeColor(HexColor("#eeeeee"))
        c.rect(left_margin, y - item_row_height, table_width, item_row_height, fill=False, stroke=True)
        
        item_y = y - item_row_height + 3.5 * mm
        
        # S.No
        c.setFillColor(HexColor("#666666"))
        c.setFont("Helvetica", 9)
        c.drawCentredString(col_positions[0] + col_widths[0] * table_width / 2, item_y, str(idx + 1))
        
        # Product name
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 9)
        product_name = item.get("name", "Product")[:30]  # Truncate
        c.drawString(col_positions[1] + 2 * mm, item_y + 2, product_name)
        
        # Variant (size/color)
        variant_parts = []
        if item.get("color"):
            variant_parts.append(item["color"])
        if item.get("size"):
            variant_parts.append(item["size"])
        
        if variant_parts:
            c.setFont("Helvetica", 7)
            c.setFillColor(HexColor("#888888"))
            c.drawString(col_positions[1] + 2 * mm, item_y - 3, " • ".join(variant_parts))
        
        # Quantity
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(col_positions[2] + col_widths[2] * table_width / 2, item_y, 
                           str(item.get("quantity", 1)))
        
        # Price
        c.setFont("Helvetica", 9)
        c.setFillColor(HexColor("#666666"))
        c.drawRightString(col_positions[3] + col_widths[3] * table_width - 2 * mm, item_y,
                         format_price_inr(item.get("price", 0)))
        
        # Total
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 9)
        line_total = item.get("price", 0) * item.get("quantity", 1)
        c.drawRightString(col_positions[4] + col_widths[4] * table_width - 2 * mm, item_y,
                         format_price_inr(line_total))
        
        y -= item_row_height
    
    return y - 5 * mm


def _draw_totals_section(c, y, width, subtotal, shipping, total, store_slug):
    """Draw totals box (right side) and QR code (left side)."""
    # QR Code (left side)
    qr_size = 25 * mm
    qr_x = 20 * mm
    qr_y = y - qr_size - 5 * mm
    
    if store_slug:
        try:
            # Generate QR code for store URL
            store_url = f"https://flowauxi.com/store/{store_slug}"
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=2,
            )
            qr.add_data(store_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white")
            
            # Convert to bytes for ReportLab
            qr_buffer = io.BytesIO()
            qr_img.save(qr_buffer, format='PNG')
            qr_buffer.seek(0)
            qr_reader = ImageReader(qr_buffer)
            
            # Draw QR code
            c.drawImage(qr_reader, qr_x, qr_y, width=qr_size, height=qr_size)
            
            # Label below QR
            c.setFillColor(HexColor("#888888"))
            c.setFont("Helvetica", 7)
            c.drawString(qr_x, qr_y - 4 * mm, "Scan to visit store")
            
            logger.debug(f"QR code generated for {store_url}")
        except Exception as e:
            logger.warning(f"Failed to generate QR code: {e}")
    
    # Totals box (right side)
    box_width = 60 * mm
    box_height = 28 * mm
    box_x = width - 20 * mm - box_width
    box_y = y - box_height
    
    # Background
    c.setFillColor(HexColor("#f9fafb"))
    c.roundRect(box_x, box_y, box_width, box_height, 3, fill=True, stroke=False)
    
    # Totals text
    text_x = box_x + 5 * mm
    value_x = box_x + box_width - 5 * mm
    row_y = y - 8 * mm
    
    # Subtotal
    c.setFillColor(HexColor("#666666"))
    c.setFont("Helvetica", 9)
    c.drawString(text_x, row_y, "Subtotal")
    c.drawRightString(value_x, row_y, format_price_inr(subtotal))
    
    # Shipping
    row_y -= 5 * mm
    c.drawString(text_x, row_y, "Shipping")
    if shipping == 0:
        c.setFillColor(HexColor("#22c55e"))
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(value_x, row_y, "FREE")
    else:
        c.drawRightString(value_x, row_y, format_price_inr(shipping))
    
    # Divider
    row_y -= 4 * mm
    c.setStrokeColor(HexColor("#e0e0e0"))
    c.setLineWidth(0.5)
    c.line(text_x, row_y, value_x, row_y)
    
    # Total
    row_y -= 6 * mm
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(text_x, row_y, "Total")
    c.drawRightString(value_x, row_y, format_price_inr(total))
    
    return box_y - 10 * mm


def _draw_footer(c, width, payment_label, payment_color, order_id):
    """Draw footer with payment info."""
    y = 35 * mm
    
    # Payment label
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(20 * mm, y, "Mode of Payment")
    
    # Payment badge
    badge_y = y - 7 * mm
    badge_width = 35 * mm if payment_label == "CASH ON DELIVERY" else 25 * mm
    badge_height = 5 * mm
    
    c.setFillColor(HexColor(payment_color))
    c.roundRect(20 * mm, badge_y, badge_width, badge_height, 2, fill=True, stroke=False)
    
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(20 * mm + badge_width / 2, badge_y + 1.5, payment_label)
    
    # Order ID
    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 8)
    c.drawString(20 * mm, badge_y - 6 * mm, f"Order ID: {order_id}")
    
    # Right side - Thank you
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - 20 * mm, y, "Thank you for your order!")
    
    # Powered by
    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 8)
    c.drawRightString(width - 20 * mm, y - 5 * mm, "Powered by")
    
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - 20 * mm, y - 10 * mm, "Flowauxi")
    
    # System-generated disclaimer
    c.setFillColor(HexColor("#999999"))
    c.setFont("Helvetica", 6)
    c.drawCentredString(width / 2, 10 * mm, "This is a system-generated invoice.")


def _wrap_text(text: str, max_chars: int) -> List[str]:
    """Wrap text to fit within max characters."""
    words = text.split()
    lines = []
    current_line = ""
    
    for word in words:
        if len(current_line) + len(word) + 1 <= max_chars:
            current_line = f"{current_line} {word}".strip()
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    
    if current_line:
        lines.append(current_line)
    
    return lines
