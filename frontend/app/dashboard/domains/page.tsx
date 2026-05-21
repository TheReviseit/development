"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  DatabaseZap,
  Globe2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import styles from "./domains.module.css";

type FeatureState = {
  allowed: boolean;
  is_unlimited?: boolean;
  hard_limit?: number | null;
  denial_reason?: string;
};

type TenantDomain = {
  id: string;
  host: string;
  normalizedHost: string;
  apexHost?: string | null;
  setupMode?: "manual_dns" | "nameserver";
  productDomain: string;
  status: string;
  dnsStatus: string;
  sslStatus: string;
  providerStatus: string;
  ownershipStatus: string;
  nameserverStatus?: string;
  managedDnsStatus?: string;
  desiredNameservers?: string[];
  routingEnabled: boolean;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  expectedRecords?: Array<{
    type: string;
    name: string;
    value: string;
    ttl?: number;
    required?: boolean;
  }>;
  managedRecords?: Array<{
    type: string;
    name: string;
    value: string;
    ttl?: number;
  }>;
  observedRecords?: Record<string, string[]>;
};

type ApiError = {
  code?: string;
  message?: string;
  error?: string;
};

export default function DomainsPage() {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [storeSlugFeature, setStoreSlugFeature] = useState<FeatureState | null>(null);
  const [dnsFeature, setDnsFeature] = useState<FeatureState | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [setupMode, setSetupMode] = useState<"nameserver" | "manual_dns">("nameserver");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const dnsAllowed = Boolean(dnsFeature?.allowed);
  const storeSlugAllowed = Boolean(storeSlugFeature?.allowed);

  const planBadge = useMemo(() => {
    if (dnsAllowed) return { label: "Pro", tone: "success" };
    if (storeSlugAllowed) return { label: "Business", tone: "warning" };
    return { label: "Starter", tone: "neutral" };
  }, [dnsAllowed, storeSlugAllowed]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [slugRes, dnsRes, domainsRes] = await Promise.all([
        fetch("/api/features/check?feature=custom_domain&domain=shop", { cache: "no-store" }),
        fetch("/api/features/check?feature=custom_dns_domain&domain=shop", { cache: "no-store" }),
        fetch("/api/domains?productDomain=shop", { cache: "no-store" }),
      ]);

      if (slugRes.ok) setStoreSlugFeature(await slugRes.json());
      if (dnsRes.ok) setDnsFeature(await dnsRes.json());

      if (domainsRes.ok) {
        const data = await readApiResponse<{ domains?: TenantDomain[] }>(domainsRes);
        const listedDomains: TenantDomain[] = data.domains || [];
        setDomains(await loadDomainDetails(listedDomains));
      } else if (domainsRes.status !== 401) {
        const data = await readApiResponse<ApiError>(domainsRes);
        throw new Error(data.message || data.error || "Failed to load domains");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addDomain() {
    const host = domainInput.trim();
    if (!host) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/domains", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ domain: host, productDomain: "shop", setupMode }),
      });
      const data = await readApiResponse<ApiError>(response);
      if (!response.ok) {
        throw new Error(toFriendlyError(data));
      }
      setMessage(
        setupMode === "nameserver"
          ? "Domain added. Change nameservers at your registrar, then verify."
          : "Domain added. Add the DNS records below, then verify.",
      );
      setDomainInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setSaving(false);
    }
  }

  async function verifyDomain(id: string) {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/domains/${id}/verify`, { method: "POST" });
      const data = await readApiResponse<ApiError>(response);
      if (!response.ok) {
        setError(toFriendlyError(data));
        return;
      }
      setMessage("Verification checked. If it still shows pending, DNS has not propagated yet.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify domain");
    }
  }

  async function removeDomain(id: string) {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/domains/${id}`, { method: "DELETE" });
      const data = await readApiResponse<ApiError>(response);
      if (!response.ok) {
        setError(toFriendlyError(data));
        return;
      }
      setMessage("Domain removed locally.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove domain");
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(value);
    setTimeout(() => setCopiedValue(null), 1600);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Shop domain access</p>
          <h1 className={styles.title}>Domains</h1>
        </div>
        <div className={`${styles.planBadge} ${styles[planBadge.tone]}`}>
          <ShieldCheck size={16} />
          {planBadge.label}
        </div>
      </header>

      <section className={styles.entitlements}>
        <div className={styles.entitlementRow}>
          <div>
            <h2>Store URL</h2>
            <p>/store/storeurl</p>
          </div>
          <span className={storeSlugAllowed ? styles.allowed : styles.blocked}>
            {storeSlugAllowed ? "Available" : "Locked"}
          </span>
        </div>
        <div className={styles.entitlementRow}>
          <div>
            <h2>Custom DNS Domain</h2>
            <p>customer.com</p>
          </div>
          <span className={dnsAllowed ? styles.allowed : styles.blocked}>
            {dnsAllowed ? "Available" : "Pro only"}
          </span>
        </div>
      </section>

      {error && (
        <div className={styles.alertError}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {message && (
        <div className={styles.alertSuccess}>
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}

      <section className={styles.addSection}>
        <div className={styles.addCopy}>
          <h2>Add Custom Domain</h2>
          <p>{dnsAllowed ? "Recommended: change nameservers once, then Flowauxi manages DNS automatically." : "Upgrade to Pro to connect a real DNS domain."}</p>
        </div>
        <div className={styles.addControls}>
          <div className={styles.setupToggle} aria-label="Domain setup mode">
            <button
              type="button"
              className={setupMode === "nameserver" ? styles.selectedMode : ""}
              onClick={() => setSetupMode("nameserver")}
              disabled={!dnsAllowed || saving}
            >
              <DatabaseZap size={15} />
              Nameservers
            </button>
            <button
              type="button"
              className={setupMode === "manual_dns" ? styles.selectedMode : ""}
              onClick={() => setSetupMode("manual_dns")}
              disabled={!dnsAllowed || saving}
            >
              <Globe2 size={15} />
              Manual DNS
            </button>
          </div>
          <div className={styles.addForm}>
            <Globe2 size={18} />
            <input
              value={domainInput}
              onChange={(event) => setDomainInput(event.target.value)}
              placeholder="yourdomain.com"
              disabled={!dnsAllowed || saving}
            />
            <button onClick={addDomain} disabled={!dnsAllowed || saving || !domainInput.trim()}>
              {saving ? "Adding" : "Add"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.domainList}>
        {loading ? (
          <div className={styles.empty}>Loading domains...</div>
        ) : domains.length === 0 ? (
          <div className={styles.empty}>No custom DNS domains added yet.</div>
        ) : (
          domains.map((domain) => (
            <article key={domain.id} className={styles.domainItem}>
              <div className={styles.domainTop}>
                <div>
                  <h2>{domain.host}</h2>
                  <p>{domain.normalizedHost}</p>
                </div>
                <StatusPill status={domain.status} />
              </div>

              <div className={styles.statusGrid}>
                <StatusMetric label="Ownership" value={domain.ownershipStatus} />
                <StatusMetric label="DNS" value={domain.dnsStatus} />
                {domain.setupMode === "nameserver" && (
                  <>
                    <StatusMetric label="Nameservers" value={domain.nameserverStatus || "pending"} />
                    <StatusMetric label="Managed DNS" value={domain.managedDnsStatus || "pending"} />
                  </>
                )}
                <StatusMetric label="SSL" value={domain.sslStatus} />
                <StatusMetric label="Routing" value={domain.routingEnabled ? "active" : "off"} />
              </div>

              {needsNameserverChange(domain) && (
                <div className={styles.nextStep}>
                  <strong>Change nameservers at your registrar.</strong>
                  <p>
                    Replace the domain&apos;s current nameservers with the values below.
                    After propagation, Flowauxi will create the needed DNS records through Vercel automatically.
                  </p>
                </div>
              )}

              {domain.lastErrorCode && (
                <div className={styles.inlineError}>
                  {domain.lastErrorCode}: {domain.lastErrorMessage}
                </div>
              )}

              {needsProviderActivation(domain) && (
                <div className={styles.nextStep}>
                  <strong>DNS is verified. SSL is waiting for Vercel.</strong>
                  <p>
                    Local development can verify DNS, but it cannot issue a real
                    certificate. To make this domain live, configure the Vercel
                    provider in production, add the domain to your Vercel
                    project, then verify again.
                  </p>
                </div>
              )}

              {domain.expectedRecords && domain.expectedRecords.length > 0 && (
                <div className={styles.records}>
                  <div className={styles.recordsHeader}>
                    <div>
                      <h3>{domain.setupMode === "nameserver" ? "Nameservers to set" : "DNS records to add"}</h3>
                      <p>
                        {domain.setupMode === "nameserver"
                          ? "Set these at your registrar. After they propagate, Flowauxi manages DNS automatically."
                          : "Add these at your domain provider. Use TTL Auto, or 300 seconds if TTL is required."}
                      </p>
                    </div>
                  </div>
                  {domain.expectedRecords.map((record) => (
                    <div key={`${record.type}:${record.name}`} className={styles.recordRow}>
                      <div className={styles.recordCell}>
                        <span>Type</span>
                        <strong>{record.type}</strong>
                      </div>
                      <div className={styles.recordCell}>
                        <span>Name / Host</span>
                        <code>{formatRegistrarHost(record.name, domain)}</code>
                      </div>
                      <div className={styles.recordCell}>
                        <span>{record.type === "CNAME" ? "Target" : "Value"}</span>
                        <code>{record.value}</code>
                      </div>
                      <div className={styles.recordCell}>
                        <span>TTL</span>
                        <strong>{formatTtl(record.ttl)}</strong>
                      </div>
                      <button onClick={() => copy(record.value)} title="Copy value">
                        <Copy size={15} />
                        {copiedValue === record.value ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {domain.setupMode === "nameserver" && domain.managedRecords && domain.managedRecords.length > 0 && (
                <div className={styles.records}>
                  <div className={styles.recordsHeader}>
                    <div>
                      <h3>Records Flowauxi manages after nameserver verification</h3>
                      <p>You do not add these manually when using nameservers; they are shown for transparency.</p>
                    </div>
                  </div>
                  {domain.managedRecords.map((record) => (
                    <div key={`managed:${record.type}:${record.name}`} className={styles.recordRow}>
                      <div className={styles.recordCell}>
                        <span>Type</span>
                        <strong>{record.type}</strong>
                      </div>
                      <div className={styles.recordCell}>
                        <span>Name / Host</span>
                        <code>{record.name || "@"}</code>
                      </div>
                      <div className={styles.recordCell}>
                        <span>{record.type === "CNAME" ? "Target" : "Value"}</span>
                        <code>{record.value}</code>
                      </div>
                      <div className={styles.recordCell}>
                        <span>TTL</span>
                        <strong>{formatTtl(record.ttl)}</strong>
                      </div>
                      <button onClick={() => copy(record.value)} title="Copy value">
                        <Copy size={15} />
                        {copiedValue === record.value ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                <button onClick={() => verifyDomain(domain.id)}>
                  <RefreshCw size={16} />
                  Verify
                </button>
                <button className={styles.dangerButton} onClick={() => removeDomain(domain.id)}>
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "active" ? "success" : status.includes("failed") ? "danger" : "warning";
  return <span className={`${styles.statusPill} ${styles[tone]}`}>{status}</span>;
}

function needsProviderActivation(domain: TenantDomain) {
  return (
    domain.ownershipStatus === "verified"
    && domain.dnsStatus === "verified"
    && domain.sslStatus === "pending"
    && !domain.routingEnabled
  );
}

function needsNameserverChange(domain: TenantDomain) {
  return domain.setupMode === "nameserver" && domain.nameserverStatus !== "verified";
}

async function loadDomainDetails(listedDomains: TenantDomain[]) {
  if (listedDomains.length === 0) return listedDomains;
  return Promise.all(
    listedDomains.map(async (domain) => {
      try {
        const response = await fetch(`/api/domains/${domain.id}`, {
          cache: "no-store",
        });
        if (!response.ok) return domain;
        const data = await readApiResponse<{ domain?: TenantDomain }>(response);
        return data.domain ? { ...domain, ...data.domain } : domain;
      } catch {
        return domain;
      }
    }),
  );
}

async function readApiResponse<T extends object>(response: Response): Promise<T & ApiError> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T & ApiError;
  }

  try {
    return JSON.parse(text) as T & ApiError;
  } catch {
    return {
      error: text,
      message: response.ok ? undefined : "Server returned an invalid response.",
    } as T & ApiError;
  }
}

function formatRegistrarHost(recordName: string, domain: TenantDomain) {
  const apexHost = domain.apexHost || domain.normalizedHost;
  if (recordName === apexHost) {
    return `@ or ${recordName}`;
  }
  if (recordName.endsWith(`.${apexHost}`)) {
    const relativeName = recordName.slice(0, -(apexHost.length + 1));
    return `${relativeName} or ${recordName}`;
  }
  return recordName;
}

function formatTtl(ttl?: number) {
  return ttl ? `${ttl}s` : "Auto or 300s";
}

function toFriendlyError(data: ApiError) {
  if (data.code === "ENTITLEMENT_REQUIRED") {
    return "Business keeps /store/storeurl. Real DNS custom domains are Pro only.";
  }
  return data.message || data.error || data.code || "Request failed";
}
