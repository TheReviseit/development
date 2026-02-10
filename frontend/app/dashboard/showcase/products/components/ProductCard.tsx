// Product Card Component for Showcase Dashboard
// Uses nova card design from store

import React from "react";

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    description?: string;
    price?: number;
    category?: string;
    image_url?: string;
    is_visible: boolean;
    is_featured: boolean;
  };
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}

export default function ProductCard({
  product,
  onEdit,
  onToggleVisibility,
  onDelete,
}: ProductCardProps) {
  return (
    <div className="novaCard" onClick={onEdit}>
      {/* Image Container */}
      <div className="novaImageContainer">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="novaImage"
          />
        ) : (
          <div className="novaImagePlaceholder">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* Featured Badge */}
        {product.is_featured && <div className="novaFeaturedBadge">★</div>}
      </div>

      {/* Content Area - Horizontal Flex */}
      <div className="novaContent">
        <div className="novaInfo">
          <h3 className="novaTitle">{product.title}</h3>
          {product.description && (
            <p className="novaDescription">{product.description}</p>
          )}
        </div>

        <div className="novaPriceRow">
          {product.category && (
            <span className="novaCategory">{product.category}</span>
          )}
          <span className="novaPrice">₹{product.price || 0}</span>
        </div>

        {/* Action Buttons */}
        <div className="novaActions" onClick={(e) => e.stopPropagation()}>
          <button className="novaActionBtn" onClick={onEdit}>
            Edit
          </button>
          <button
            className="novaActionBtn secondary"
            onClick={onToggleVisibility}
          >
            {product.is_visible ? "Hide" : "Show"}
          </button>
          <button
            className="novaActionBtn secondary"
            onClick={onDelete}
            style={{ color: "#ff4d4d", borderColor: "rgba(255,255,255,0.1)" }}
          >
            Delete
          </button>
        </div>

        {/* List Arrow Like Reference */}
        <div className="novaListItemArrow">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
