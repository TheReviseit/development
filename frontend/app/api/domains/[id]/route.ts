import { NextRequest } from "next/server";
import { proxyDomainRequest } from "@/lib/custom-domains/apiProxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyDomainRequest({
    method: "GET",
    backendPath: `/api/domains/${encodeURIComponent(id)}`,
    request,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyDomainRequest({
    method: "PATCH",
    backendPath: `/api/domains/${encodeURIComponent(id)}`,
    request,
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyDomainRequest({
    method: "DELETE",
    backendPath: `/api/domains/${encodeURIComponent(id)}`,
    request,
  });
}

