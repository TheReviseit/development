import { NextRequest } from "next/server";
import { proxyDomainRequest } from "@/lib/custom-domains/apiProxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyDomainRequest({
    method: "POST",
    backendPath: `/api/domains/${encodeURIComponent(id)}/verify`,
    request,
  });
}

