import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface ValidationItem {
  product_id: string;
  variant_id?: string | null;
  name: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
}

interface InsufficientItem {
  product_id: string;
  variant_id: string | null;
  size: string | null;
  color: string | null;
  name: string;
  requested: number;
  available: number;
}

/**
 * POST - Validate stock availability for items
 *
 * Based on schema:
 * - Products have size_stocks JSONB like {"XXL": 2, "Free Size": 2}
 * - Product variants have size_stocks JSONB like {"L": 30, "M": 30}
 * - products.stock_quantity is often 0 when size_stocks is used
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  try {
    const { storeSlug } = await params;

    if (!storeSlug) {
      return NextResponse.json(
        { valid: false, message: "Store slug is required" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { items } = body as { items: ValidationItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { valid: false, message: "Items array is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    const insufficientItems: InsufficientItem[] = [];

    // Check stock for each item
    for (const item of items) {
      let productId = item.product_id;
      let product: any = null;

      // Look up product by ID or name
      if (productId) {
        const { data } = await supabase
          .from("products")
          .select("id, stock_quantity, size_stocks, has_size_pricing")
          .eq("id", productId)
          .single();
        product = data;
      } else if (item.name) {
        const { data } = await supabase
          .from("products")
          .select("id, stock_quantity, size_stocks, has_size_pricing")
          .eq("user_id", storeSlug)
          .ilike("name", item.name)
          .single();
        if (data) {
          product = data;
          productId = data.id;
        }
      }

      if (!product || !productId) continue; // Can't validate without product

      let availableStock = 0;

      // Check if product has variants with matching color
      if (item.color) {
        const { data: variants } = await supabase
          .from("product_variants")
          .select("id, color, size_stocks, stock_quantity, has_size_pricing")
          .eq("product_id", productId)
          .eq("user_id", storeSlug)
          .eq("is_deleted", false);

        if (variants && variants.length > 0) {
          // Find matching variant by color (case-insensitive)
          const matchingVariant = variants.find(
            (v) => v.color?.toLowerCase() === item.color?.toLowerCase(),
          );

          if (matchingVariant) {
            // Parse size_stocks if it's a string
            let sizeStocks = matchingVariant.size_stocks;
            if (typeof sizeStocks === "string") {
              try {
                sizeStocks = JSON.parse(sizeStocks);
              } catch {
                sizeStocks = {};
              }
            }

            // Check size_stocks JSONB for specific size
            if (item.size && sizeStocks && typeof sizeStocks === "object") {
              // Try exact match first
              availableStock = sizeStocks[item.size] ?? 0;
              // Try case-insensitive match
              if (availableStock === 0) {
                const sizeKey = Object.keys(sizeStocks).find(
                  (k) => k.toLowerCase() === item.size?.toLowerCase(),
                );
                if (sizeKey) availableStock = sizeStocks[sizeKey] ?? 0;
              }
            } else {
              // No size specified, use variant stock_quantity
              availableStock = matchingVariant.stock_quantity || 0;
            }
          }
        }
      }

      // If no variant stock found, check product-level size_stocks
      if (availableStock === 0 && item.size) {
        // Parse size_stocks if it's a string
        let sizeStocks = product.size_stocks;
        if (typeof sizeStocks === "string") {
          try {
            sizeStocks = JSON.parse(sizeStocks);
          } catch {
            sizeStocks = {};
          }
        }

        if (sizeStocks && typeof sizeStocks === "object") {
          // Try exact match first
          availableStock = sizeStocks[item.size] ?? 0;
          // Try case-insensitive match
          if (availableStock === 0) {
            const sizeKey = Object.keys(sizeStocks).find(
              (k) => k.toLowerCase() === item.size?.toLowerCase(),
            );
            if (sizeKey) availableStock = sizeStocks[sizeKey] ?? 0;
          }
        }
      }

      // Final fallback to product stock_quantity (if no size-based stock)
      if (availableStock === 0 && !item.size) {
        availableStock = product.stock_quantity || 0;
      }

      console.log(
        `📦 Validate stock for "${item.name}" (size: ${item.size}, color: ${item.color}): ${availableStock} available, ${item.quantity} requested`,
      );

      if (availableStock < item.quantity) {
        insufficientItems.push({
          product_id: productId,
          variant_id: item.variant_id || null,
          size: item.size || null,
          color: item.color || null,
          name: item.name,
          requested: item.quantity,
          available: availableStock,
        });
      }
    }

    if (insufficientItems.length > 0) {
      // Format message for the first insufficient item
      const first = insufficientItems[0];
      const variantInfo = [first.color, first.size].filter(Boolean).join(" / ");
      const message = `Only ${first.available} units of ${first.name}${variantInfo ? ` (${variantInfo})` : ""} available. You requested ${first.requested}.`;

      return NextResponse.json({
        valid: false,
        message,
        insufficient_items: insufficientItems,
      });
    }

    return NextResponse.json({
      valid: true,
      message: "All items available",
    });
  } catch (error) {
    console.error("Error validating stock:", error);
    return NextResponse.json(
      { valid: false, message: "Error validating stock" },
      { status: 500 },
    );
  }
}
