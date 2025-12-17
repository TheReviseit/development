class UserCache {
  constructor() {
    this.emailMap = new Map(); // email -> User
    this.firebaseUidMap = new Map(); // firebase_uid -> User
    this.initialized = false;
    this.stats = {
      hits: 0,
      misses: 0,
      lastInitialized: null,
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      console.log("[UserCache] Initializing cache from database...");

      const { getAllActiveUsers } = await import("@/lib/supabase/queries");
      const users = await getAllActiveUsers();

      for (const user of users) {
        this._setInternal(user);
      }

      this.initialized = true;
      this.stats.lastInitialized = new Date().toISOString();
      console.log(`[UserCache] Cache initialized with ${users.length} users`);
    } catch (error) {
      console.error("[UserCache] Failed to initialize cache:", error);
      // Don't throw - allow fallback to database
    }
  }

  _setInternal(user) {
    if (!user || !user.email || !user.firebase_uid) {
      console.warn("[UserCache] Invalid user object, skipping cache insert");
      return;
    }

    this.emailMap.set(user.email.toLowerCase(), user);
    this.firebaseUidMap.set(user.firebase_uid, user);
  }

  set(user) {
    try {
      this._setInternal(user);
      console.log(`[UserCache] Cached user: ${user.email}`);
    } catch (error) {
      console.error("[UserCache] Failed to cache user:", error);
      // Don't throw - cache failure shouldn't break the app
    }
  }

  async get(key, type = "email") {
    await this.initialize();

    if (!key) return null;

    let user = null;

    if (type === "email") {
      user = this.emailMap.get(key.toLowerCase());
    } else if (type === "firebase_uid") {
      user = this.firebaseUidMap.get(key);
    }

    if (user) {
      this.stats.hits++;
      console.log(`[UserCache] HIT for ${type}: ${key}`);
      return user;
    } else {
      this.stats.misses++;
      console.log(`[UserCache] MISS for ${type}: ${key}`);
      return null;
    }
  }

  delete(key, type = "email") {
    if (!key) return;

    try {
      if (type === "email") {
        const user = this.emailMap.get(key.toLowerCase());
        if (user) {
          this.emailMap.delete(key.toLowerCase());
          this.firebaseUidMap.delete(user.firebase_uid);
          console.log(`[UserCache] Deleted user: ${key}`);
        }
      } else if (type === "firebase_uid") {
        const user = this.firebaseUidMap.get(key);
        if (user) {
          this.firebaseUidMap.delete(key);
          this.emailMap.delete(user.email.toLowerCase());
          console.log(`[UserCache] Deleted user: ${key}`);
        }
      }
    } catch (error) {
      console.error("[UserCache] Failed to delete user:", error);
    }
  }

  clear() {
    this.emailMap.clear();
    this.firebaseUidMap.clear();
    this.initialized = false;
    console.log("[UserCache] Cache cleared");
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate =
      total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      total,
      hitRate: `${hitRate}%`,
      size: this.emailMap.size,
    };
  }

  size() {
    return this.emailMap.size;
  }
}

let cacheInstance = null;

export function getUserCache() {
  if (!cacheInstance) {
    cacheInstance = new UserCache();
  }
  return cacheInstance;
}

// Export for testing
export { UserCache };
