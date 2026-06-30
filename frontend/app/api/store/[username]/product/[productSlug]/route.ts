import { NextRequest, NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/store/product/queries";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ username: string; productSlug: string }> },
) {
  const { username, productSlug } = await context.params;

  if (!username || !productSlug) {
    return NextResponse.json(
      { success: false, error: "Missing parameters" },
      { status: 400 },
    );
  }

  const { product } = await getProductBySlug(username, productSlug);

  if (!product) {
    return NextResponse.json(
      { success: false, error: "Product not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: product });
}
