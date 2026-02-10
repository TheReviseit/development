"""
Enterprise Showcase Domain Entities
Author: Flowauxi Team
Date: 2026-02-09

Design Philosophy:
- Content-first, commerce-optional
- JSONB-driven extensibility
- Version-aware data structures
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ContentType(Enum):
    """Soft classification hint for UX/analytics (does NOT drive logic)"""
    GENERIC = "generic"
    VISUAL = "visual"      # Photography, art, portfolios
    SERVICE = "service"    # Appointments, consultations
    CATALOG = "catalog"    # Products, e-commerce


@dataclass
class PresentationConfig:
    """
    JSONB-driven UI configuration (Enterprise Fix #1)
    
    Benefits:
    - No migrations when adding new toggles
    - Backward compatible versioning
    - A/B testing ready
    - Theme packs ready
    """
    version: int = 1
    fields: Dict[str, Dict[str, bool]] = field(default_factory=lambda: {
        "price": {"visible": False},
        "colors": {"visible": False},
        "sizes": {"visible": False},
        "stock": {"visible": False},
        "category": {"visible": True},
        "description": {"visible": True}
    })
    actions: Dict[str, Dict[str, Any]] = field(default_factory=lambda: {
        "order": {"enabled": False, "label": "Order Now"},
        "book": {"enabled": False, "label": "Book Now"}
    })
    layout: Dict[str, str] = field(default_factory=lambda: {
        "type": "standard",
        "imageRatio": "1:1"
    })

    def to_dict(self) -> Dict:
        """Convert to JSONB-ready dict"""
        return {
            "version": self.version,
            "fields": self.fields,
            "actions": self.actions,
            "layout": self.layout
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'PresentationConfig':
        """Parse from JSONB"""
        return cls(
            version=data.get("version", 1),
            fields=data.get("fields", {}),
            actions=data.get("actions", {}),
            layout=data.get("layout", {"type": "standard", "imageRatio": "1:1"})
        )


@dataclass
class CommerceData:
    """
    Optional commerce data (Enterprise Fix #2)
    
    Stored as JSONB to avoid tight coupling.
    Only populated if business shows commerce fields.
    """
    price: Optional[float] = None
    compare_at: Optional[float] = None
    inventory: Optional[Dict[str, Any]] = None  # {"status": "in_stock", "quantity": 12}
    variants: List[Dict[str, Any]] = field(default_factory=list)  # [{"color": "Red", "size": "M"}]

    def to_dict(self) -> Dict:
        """Convert to JSONB for storage"""
        data = {}
        if self.price is not None:
            data["price"] = self.price
        if self.compare_at is not None:
            data["compareAt"] = self.compare_at
        if self.inventory:
            data["inventory"] = self.inventory
        if self.variants:
            data["variants"] = self.variants
        return data if data else None

    @classmethod
    def from_dict(cls, data: Optional[Dict]) -> Optional['CommerceData']:
        """Parse from JSONB (None if no commerce data)"""
        if not data:
            return None
        return cls(
            price=data.get("price"),
            compare_at=data.get("compareAt"),
            inventory=data.get("inventory"),
            variants=data.get("variants", [])
        )


@dataclass
class ShowcaseSettings:
    """
    Per-business showcase configuration
    
    Maps to: showcase_settings table
    """
    id: str
    user_id: str
    presentation_config: PresentationConfig
    config_version: int = 1
    content_type: ContentType = ContentType.GENERIC
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_db(cls, row: Dict) -> 'ShowcaseSettings':
        """Map from database row"""
        return cls(
            id=row['id'],
            user_id=row['user_id'],
            presentation_config=PresentationConfig.from_dict(row.get('presentation_config', {})),
            config_version=row.get('config_version', 1),
            content_type=ContentType(row.get('content_type', 'generic')),
            metadata=row.get('metadata', {}),
            created_at=row.get('created_at'),
            updated_at=row.get('updated_at')
        )


@dataclass
class ShowcaseItem:
    """
    Individual showcase item (content-first)
    
    Maps to: showcase_items table
    """
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    image_public_id: Optional[str] = None
    thumbnail_url: Optional[str] = None
    additional_images: List[str] = field(default_factory=list)
    category_id: Optional[str] = None
    
    # Optional commerce data (JSONB)
    commerce: Optional[CommerceData] = None
    
    # Extensible metadata (JSONB)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Status
    is_visible: bool = True
    is_featured: bool = False
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    
    # Engagement
    view_count: int = 0
    like_count: int = 0
    
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_db(cls, row: Dict) -> 'ShowcaseItem':
        """Map from database row"""
        # Parse additional_images from JSONB
        additional_images = row.get('additional_images', [])
        if isinstance(additional_images, str):
            import json
            additional_images = json.loads(additional_images)
        
        return cls(
            id=row['id'],
            user_id=row['user_id'],
            title=row['title'],
            description=row.get('description'),
            subtitle=row.get('subtitle'),
            image_url=row.get('image_url'),
            image_public_id=row.get('image_public_id'),
            thumbnail_url=row.get('thumbnail_url'),
            additional_images=additional_images,
            category_id=row.get('category_id'),
            commerce=CommerceData.from_dict(row.get('commerce')),
            metadata=row.get('metadata', {}),
            is_visible=row.get('is_visible', True),
            is_featured=row.get('is_featured', False),
            is_deleted=row.get('is_deleted', False),
            deleted_at=row.get('deleted_at'),
            view_count=row.get('view_count', 0),
            like_count=row.get('like_count', 0),
            created_at=row.get('created_at'),
            updated_at=row.get('updated_at')
        )
