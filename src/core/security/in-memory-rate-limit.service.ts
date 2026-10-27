import { Injectable } from '@nestjs/common';

interface RateLimitBucket {
  count: number;
  resetsAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class InMemoryRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private callsSinceCleanup = 0;

  check(key: string, maxRequests: number, windowMs: number, now = Date.now()): RateLimitResult {
    if (!this.enabled) return { allowed: true, retryAfterSeconds: 0 };

    if (++this.callsSinceCleanup >= 256) {
      this.callsSinceCleanup = 0;
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetsAt <= now) this.buckets.delete(bucketKey);
      }
    }

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      bucket = { count: 0, resetsAt: now + windowMs };
      this.buckets.set(key, bucket);
    }

    if (bucket.count >= maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000)),
      };
    }

    bucket.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private get enabled(): boolean {
    return process.env.SECURITY_RATE_LIMIT_ENABLED?.toLowerCase() !== 'false';
  }
}
