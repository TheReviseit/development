import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductDomain, SyncUserResponse } from "@/types/auth.types";
import {
  generateAuthSyncWarmCacheKey,
  putAuthSyncWarmCache,
} from "@/lib/auth/authSyncIdempotency";

export const AUTH_SYNC_MEMORY_CACHE_TTL_MS = 60_000;

export type AuthSyncMemoryCacheEntry = {
  statusCode: number;
  responseBody: SyncUserResponse;
  expiresAt: number;
};

let memoryCacheRef: Map<string, AuthSyncMemoryCacheEntry> | null = null;
let buildMemoryCacheKeyRef:
  | ((uid: string, product: string, allowCreate: boolean) => string)
  | null = null;

export function registerAuthSyncMemoryCache(
  cache: Map<string, AuthSyncMemoryCacheEntry>,
  buildKey: (uid: string, product: string, allowCreate: boolean) => string,
): void {
  memoryCacheRef = cache;
  buildMemoryCacheKeyRef = buildKey;
}

export function invalidateAuthSyncMemoryCache(
  firebaseUid: string,
  product: ProductDomain = "shop",
): void {
  if (!memoryCacheRef || !buildMemoryCacheKeyRef) return;
  for (const allowCreate of [false, true]) {
    const key = buildMemoryCacheKeyRef(firebaseUid, product, allowCreate);
    memoryCacheRef.delete(key);
  }
}

export async function invalidateAuthSyncWarmCache(
  supabase: SupabaseClient,
  firebaseUid: string,
  product: ProductDomain = "shop",
): Promise<void> {
  for (const allowCreate of [false, true]) {
    const cacheKey = generateAuthSyncWarmCacheKey({
      firebaseUid,
      product,
      allowCreate,
    });
    try {
      await putAuthSyncWarmCache({
        supabase,
        cacheKey,
        statusCode: 410,
        responseBody: { invalidated: true },
        ttlSeconds: 1,
      });
    } catch {
      // non-fatal
    }
  }
}

export async function invalidateAuthSyncCaches(params: {
  supabase: SupabaseClient;
  firebaseUid: string;
  product?: ProductDomain;
}): Promise<void> {
  const product = params.product ?? "shop";
  invalidateAuthSyncMemoryCache(params.firebaseUid, product);
  await invalidateAuthSyncWarmCache(params.supabase, params.firebaseUid, product);
  console.info("[AUTH_SYNC_CACHE_INVALIDATE]", {
    event: "auth_sync_cache_invalidated_on_save",
    firebase_uid_suffix: params.firebaseUid.slice(-6),
    product,
  });
}

export async function writeThroughAuthSyncCache(params: {
  supabase: SupabaseClient;
  memoryCacheKey: string;
  warmCacheKey: string;
  statusCode: number;
  responseBody: SyncUserResponse;
  memoryCacheSet: (key: string, entry: AuthSyncMemoryCacheEntry) => void;
}): Promise<void> {
  params.memoryCacheSet(params.memoryCacheKey, {
    statusCode: params.statusCode,
    responseBody: params.responseBody,
    expiresAt: Date.now() + AUTH_SYNC_MEMORY_CACHE_TTL_MS,
  });
  await putAuthSyncWarmCache({
    supabase: params.supabase,
    cacheKey: params.warmCacheKey,
    statusCode: params.statusCode,
    responseBody: params.responseBody,
    ttlSeconds: 60,
  });
}
