import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkRateLimit, AUTH_RATE_LIMITS } from "./lib";
import { getAuthUserId } from "@convex-dev/auth/server";

// Check rate limit before authentication actions
export const checkAuthRateLimit = mutation({
  args: {
    identifier: v.string(),
    action: v.union(
      v.literal("signIn"),
      v.literal("signUp"),
      v.literal("passwordReset"),
      v.literal("emailVerify")
    ),
  },
  handler: async (ctx, args) => {
    const config = AUTH_RATE_LIMITS[args.action];
    const result = await checkRateLimit(
      ctx,
      args.identifier,
      args.action,
      config.maxAttempts,
      config.windowMs
    );
    return result;
  },
});

// Get rate limit status without consuming an attempt
export const getRateLimitStatus = query({
  args: {
    identifier: v.string(),
    action: v.union(
      v.literal("signIn"),
      v.literal("signUp"),
      v.literal("passwordReset"),
      v.literal("emailVerify")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const config = AUTH_RATE_LIMITS[args.action];
    const windowStart = now - config.windowMs;

    const recent = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier_action", (q) =>
        q.eq("identifier", args.identifier).eq("action", args.action)
      )
      .collect();

    const validAttempts = recent.filter(
      (entry) => entry.windowStart >= windowStart && entry.expiresAt >= now
    );

    const remaining = Math.max(0, config.maxAttempts - validAttempts.length);
    let resetTime = now;
    if (validAttempts.length > 0) {
      let oldest = validAttempts[0];
      for (const entry of validAttempts) {
        if (entry.windowStart < oldest.windowStart) {
          oldest = entry;
        }
      }
      resetTime = oldest.windowStart + config.windowMs;
    }

    return {
      allowed: validAttempts.length < config.maxAttempts,
      remaining,
      resetAt: resetTime,
      retryAfter: validAttempts.length >= config.maxAttempts
        ? Math.ceil((resetTime - now) / 1000)
        : 0,
    };
  },
});

// Server-side password validation (2026 best practice)
export function validatePassword(password: string): { valid: boolean; error?: string } {
  // Minimum 12 characters
  if (password.length < 12) {
    return { valid: false, error: "Password must be at least 12 characters." };
  }

  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter." };
  }

  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter." };
  }

  // At least one number
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number." };
  }

  // At least one special character
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one special character." };
  }

  // Check against common passwords
  const commonPasswords = [
    "password123", "1234567890", "qwerty1234", "admin1234",
    "letmein123", "welcome123", "login1234", "password1",
    "12345678", "qwerty", "password", "1234567890",
  ];
  if (commonPasswords.some(common => password.toLowerCase().includes(common.toLowerCase()))) {
    return { valid: false, error: "Password is too common. Choose a stronger password." };
  }

  return { valid: true };
}

// Clear rate limit for a specific identifier (admin only)
export const clearRateLimit = mutation({
  args: {
    identifier: v.string(),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Check if user is admin
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!profile || profile.role !== "admin") {
      throw new Error("Only admins can clear rate limits");
    }

    const entries = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier_action", (q) =>
        q.eq("identifier", args.identifier)
      )
      .collect();

    for (const entry of entries) {
      if (!args.action || entry.action === args.action) {
        await ctx.db.delete(entry._id);
      }
    }

    return { cleared: entries.length };
  },
});
