import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET - Track orders by order ID (public endpoint, no auth required)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");
    const storeSlug = searchParams.get("storeSlug");

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 },
      );
    }

    if (!storeSlug) {
      return NextResponse.json(
        { error: "Store slug is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    // Fetch order by order ID and store slug (user_id)
    // Using ilike for case-insensitive search
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", storeSlug)
      .ilike("order_id", orderId.trim())
      .order("created_at", { ascending: false })
      .limit(10); // Limit to prevent abuse

    if (error) {
      console.error("Error fetching order:", error);
      return NextResponse.json(
        { error: "Failed to fetch order" },
        { status: 500 },
      );
    }

    // Enrich order items with product images
    if (orders && orders.length > 0) {
      // Collect all unique product IDs from all orders
      const productIds = new Set<string>();
      orders.forEach((order) => {
        const items = order.items || [];
        items.forEach((item: { product_id?: string }) => {
          if (item.product_id) {
            productIds.add(item.product_id);
          }
        });
      });

      // Fetch product images if we have product IDs
      let productImages: Record<string, string> = {};
      if (productIds.size > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, image_url")
          .in("id", Array.from(productIds));

        if (products) {
          products.forEach((product) => {
            if (product.image_url) {
              productImages[product.id] = product.image_url;
            }
          });
        }
      }

      // Enrich items with imageUrl
      orders.forEach((order) => {
        if (order.items && Array.isArray(order.items)) {
          order.items = order.items.map(
            (item: { product_id?: string; imageUrl?: string }) => ({
              ...item,
              imageUrl:
                item.imageUrl ||
                (item.product_id ? productImages[item.product_id] : undefined),
            }),
          );
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: orders || [],
    });
  } catch (error) {
    console.error("Error in GET /api/orders/track:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
