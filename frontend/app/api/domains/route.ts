import { NextRequest } from "next/server";
import { proxyDomainRequest } from "@/lib/custom-domains/apiProxy";

export async function GET(request: NextRequest) {
  return proxyDomainRequest({
    method: "GET",
    backendPath: "/api/domains",
    request,
  });
}

export async function POST(request: NextRequest) {
  return proxyDomainRequest({
    method: "POST",
    backendPath: "/api/domains",
    request,
  });
}

