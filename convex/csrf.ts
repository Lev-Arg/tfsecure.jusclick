import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// Generate a cryptographically secure CSRF token
export const generateToken = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Generate cryptographically secure token
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Store in Convex with expiration (1 hour)
    const expiresAt = Date.now() + 3600_000;
    await ctx.runMutation(internal.csrf.storeToken, {
      token,
      userId,
      expiresAt,
    });

    return token;
  },
});

// Store CSRF token (internal mutation)
export const storeToken = internalMutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("csrfTokens", {
      token: args.token,
      userId: args.userId,
      expiresAt: args.expiresAt,
    });
  },
});

// Validate CSRF token (internal mutation)
export const validateToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const stored = await ctx.db.query("csrfTokens")
      .withIndex("by_token", q => q.eq("token", args.token))
      .first();

    if (!stored) return false;
    if (stored.userId !== userId) return false;
    if (stored.expiresAt < Date.now()) {
      await ctx.db.delete(stored._id);
      return false;
    }

    // One-time use: delete after validation
    await ctx.db.delete(stored._id);
    return true;
  },
});

// Public query to check if token is valid (without consuming it)
export const checkToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const stored = await ctx.db.query("csrfTokens")
      .withIndex("by_token", q => q.eq("token", args.token))
      .first();

    if (!stored) return false;
    if (stored.userId !== userId) return false;
    if (stored.expiresAt < Date.now()) return false;

    return true;
  },
});
