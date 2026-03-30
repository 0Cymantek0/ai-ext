/**
 * AI Response Cache
 * Caches AI-generated content to improve performance and consistency
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

export class AICache {
  private locationCache = new Map<string, CacheEntry<any>>();
  private responseCache = new Map<string, CacheEntry<string>>();
  private dialogueCache = new Map<string, CacheEntry<string>>();
  private maxCacheSize = 100;
  private maxAge = 30 * 60 * 1000; // 30 minutes

  cacheLocation(key: string, location: any): void {
    this.addToCache(this.locationCache, key, location);
  }

  getLocation(key: string): any | null {
    return this.getFromCache(this.locationCache, key);
  }

  cacheResponse(key: string, response: string): void {
    this.addToCache(this.responseCache, key, response);
  }

  getResponse(key: string): string | null {
    return this.getFromCache(this.responseCache, key);
  }

  cacheDialogue(key: string, dialogue: string): void {
    this.addToCache(this.dialogueCache, key, dialogue);
  }

  getDialogue(key: string): string | null {
    return this.getFromCache(this.dialogueCache, key);
  }

  private addToCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    data: T,
  ): void {
    // Remove oldest entries if cache is full
    if (cache.size >= this.maxCacheSize) {
      const oldestKey = this.findOldestEntry(cache);
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 0,
    });
  }

  private getFromCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
  ): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry is too old
    if (Date.now() - entry.timestamp > this.maxAge) {
      cache.delete(key);
      return null;
    }

    // Update access count
    entry.accessCount++;
    return entry.data;
  }

  private findOldestEntry<T>(cache: Map<string, CacheEntry<T>>): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  clear(): void {
    this.locationCache.clear();
    this.responseCache.clear();
    this.dialogueCache.clear();
  }

  getStats(): {
    locations: number;
    responses: number;
    dialogues: number;
  } {
    return {
      locations: this.locationCache.size,
      responses: this.responseCache.size,
      dialogues: this.dialogueCache.size,
    };
  }
}
