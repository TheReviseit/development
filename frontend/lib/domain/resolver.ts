/**
 * Domain Resolver - Single Source of Truth
 * ========================================
 * FAANG-grade domain resolution with explicit allowlist.
 * 
 * Principles:
 * - Resolve domain ONCE at entry
 * - Never use fallback chains
 * - Fail explicitly on unknown domains
 * - Production: subdomain-based, Dev: port-based
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

// =============================================================================
// CRYPTO UTILS (Web Crypto API for Edge Runtime compatibility)
// =============================================================================
// Note: Using Web Crypto instead of Node crypto for Edge Runtime support

async function signHmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// TYPES
// =============================================================================

export type ProductDomain = 
  | 'shop' 
  | 'showcase' 
  | 'marketing' 
  | 'api' 
  | 'dashboard' 
  | 'booking';

export interface DomainContext {
  domain: ProductDomain;
  tenantId: string;
  userId?: string;
  environment: 'development' | 'production';
  port?: number;
  hostname: string;
  timestamp: number;
  nonce: string;
}

export interface ResolutionResult {
  context: DomainContext | null;
  error?: string;
  matched: boolean;
}

// =============================================================================
// CONFIGURATION - Explicit Allowlist (No Defaults)
// =============================================================================

const DEV_PORT_MAP: Record<string, ProductDomain> = {
  '3000': 'dashboard',
  '3001': 'shop',
  '3002': 'showcase',
  '3003': 'marketing',
  '3004': 'api',
  '3005': 'booking',
};

const PRODUCTION_HOSTNAME_MAP: Record<string, ProductDomain> = {
  'shop.flowauxi.com': 'shop',
  'pages.flowauxi.com': 'showcase',
  'marketing.flowauxi.com': 'marketing',
  'api.flowauxi.com': 'api',
  'booking.flowauxi.com': 'booking',
  'flowauxi.com': 'dashboard',
  'www.flowauxi.com': 'dashboard',
};

// Subdomain patterns for production
const DOMAIN_PATTERNS = [
  { pattern: /^([a-z-]+)\.flowauxi\.com$/i, extract: (m: RegExpMatchArray) => m[1] },
  { pattern: /^([a-z-]+)-([a-z]{2})\.flowauxi\.com$/i, extract: (m: RegExpMatchArray) => m[1] },
  { pattern: /^flowauxi\.com$/i, extract: () => 'dashboard' },
  { pattern: /^www\.flowauxi\.com$/i, extract: () => 'dashboard' },
];

// Valid domains set for validation
const VALID_DOMAINS: Set<string> = new Set([
  'shop', 'showcase', 'marketing', 'api', 'dashboard', 'booking'
]);

// =============================================================================
// DOMAIN RESOLVER CLASS
// =============================================================================

export class DomainResolver {
  private secret: string;

  constructor() {
    this.secret = process.env.CONTEXT_SIGNING_SECRET || 'dev-secret-change-in-production';
  }

  /**
   * Resolve domain from request.
   * Returns null on unknown (never defaults).
   */
  resolve(req: Request): ResolutionResult {
    const host = this.extractHost(req);
    const port = this.extractPort(req);
    
    console.log(`[DomainResolver] Resolving: host=${host}, port=${port}`);

    // Try to resolve
    let domain: ProductDomain | null = null;
    let environment: 'development' | 'production' = 'production';

    // Development: port-based resolution
    if (this.isDevelopment(host)) {
      environment = 'development';
      if (port) {
        domain = DEV_PORT_MAP[port] || null;
      }
    }

    // Production: hostname-based resolution
    if (!domain) {
      domain = this.resolveFromHostname(host);
    }

    // Validate result
    if (!domain || !VALID_DOMAINS.has(domain)) {
      console.error(`[DomainResolver] Unknown domain: host=${host}, port=${port}`);
      return {
        context: null,
        error: `Domain not recognized: ${host}${port ? ':' + port : ''}`,
        matched: false,
      };
    }

    const context: DomainContext = {
      domain,
      tenantId: this.domainToTenantId(domain),
      environment,
      port: port ? parseInt(port, 10) : undefined,
      hostname: host,
      timestamp: Date.now(),
      nonce: generateNonce(),
    };

    console.log(`[DomainResolver] Resolved: ${host} → ${domain} (${environment})`);

    return {
      context,
      matched: true,
    };
  }

  /**
   * Sign context for secure transmission to backend.
   * Note: Now async for Web Crypto API compatibility.
   */
  async signContext(context: DomainContext, userId?: string): Promise<string> {
    const payload = JSON.stringify({
      domain: context.domain,
      tenantId: context.tenantId,
      userId: userId || context.userId,
      timestamp: context.timestamp,
      nonce: context.nonce,
      environment: context.environment,
    });

    const signature = await signHmac(payload, this.secret);
    const payloadB64 = btoa(payload);

    return `${payloadB64}.${signature}`;
  }

  /**
   * Verify signed context from frontend.
   * Note: Now async for Web Crypto API compatibility.
   */
  async verifyContext(token: string): Promise<DomainContext | null> {
    try {
      const [payloadB64, signature] = token.split('.');
      if (!payloadB64 || !signature) return null;

      // Decode payload
      const payload = atob(payloadB64);

      // Verify signature
      const expectedSignature = await signHmac(payload, this.secret);

      if (signature !== expectedSignature) {
        console.error('[DomainResolver] Invalid signature');
        return null;
      }

      // Parse payload
      const context = JSON.parse(payload);

      // Verify timestamp (5 minute TTL)
      const now = Date.now();
      if (now - context.timestamp > 5 * 60 * 1000) {
        console.error('[DomainResolver] Context expired');
        return null;
      }

      return context as DomainContext;
    } catch (error) {
      console.error('[DomainResolver] Failed to verify context:', error);
      return null;
    }
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  private extractHost(req: Request): string {
    // Check forwarded headers first (for proxies)
    const forwardedHost = req.headers.get('x-forwarded-host');
    if (forwardedHost) return forwardedHost.toLowerCase();

    // Standard host header
    const host = req.headers.get('host');
    if (host) {
      // Remove port if present
      return host.split(':')[0].toLowerCase();
    }

    // Fallback to URL
    const url = new URL(req.url);
    return url.hostname.toLowerCase();
  }

  private extractPort(req: Request): string | null {
    // Check forwarded port
    const forwardedPort = req.headers.get('x-forwarded-port');
    if (forwardedPort) return forwardedPort;

    // From host header (handle IPv6)
    const host = req.headers.get('host');
    if (host) {
      // Handle IPv6: [::1]:3001
      const ipv6Match = host.match(/\[([\da-f:]+)\]:(\d+)/);
      if (ipv6Match) return ipv6Match[2];

      // Standard host:port
      const parts = host.split(':');
      if (parts.length > 1) return parts[1];
    }

    // From URL
    const url = new URL(req.url);
    if (url.port) return url.port;

    return null;
  }

  private isDevelopment(hostname: string): boolean {
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '[::1]' ||
           hostname.includes('localhost');
  }

  private resolveFromHostname(hostname: string): ProductDomain | null {
    // Direct match
    if (PRODUCTION_HOSTNAME_MAP[hostname]) {
      return PRODUCTION_HOSTNAME_MAP[hostname];
    }

    // Pattern match
    for (const { pattern, extract } of DOMAIN_PATTERNS) {
      const match = hostname.match(pattern);
      if (match) {
        const extracted = extract(match);
        if (VALID_DOMAINS.has(extracted)) {
          return extracted as ProductDomain;
        }
      }
    }

    return null;
  }

  private domainToTenantId(domain: ProductDomain): string {
    // Map domain to canonical tenant ID
    const tenantMap: Record<ProductDomain, string> = {
      'shop': 'tenant_shop_001',
      'showcase': 'tenant_showcase_001',
      'marketing': 'tenant_marketing_001',
      'api': 'tenant_api_001',
      'dashboard': 'tenant_dashboard_001',
      'booking': 'tenant_booking_001',
    };
    return tenantMap[domain];
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const domainResolver = new DomainResolver();

// =============================================================================
// VALIDATION UTILS
// =============================================================================

export function isValidProductDomain(value: string): value is ProductDomain {
  return VALID_DOMAINS.has(value);
}

export function getDomainFromPort(port: number): ProductDomain | null {
  return DEV_PORT_MAP[String(port)] || null;
}
