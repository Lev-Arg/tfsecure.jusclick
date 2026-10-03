import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { checkRateLimit, AUTH_RATE_LIMITS } from "./lib";
import { validatePassword } from "./security";

// Server-side auth wrapper that enforces security controls
// This should be called before Convex Auth signIn/signUp operations

export const preAuthCheck = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    action: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("passwordReset")),
  },
  handler: async (ctx, args) => {
    const identifier = args.email.toLowerCase().trim();

    // Check rate limit
    const config = AUTH_RATE_LIMITS[args.action];
    const rateLimitResult = await checkRateLimit(
      ctx,
      identifier,
      args.action,
      config.maxAttempts,
      config.windowMs
    );

    if (!rateLimitResult.allowed) {
      return {
        allowed: false,
        error: `Too many attempts. Please try again in ${rateLimitResult.retryAfter} seconds.`,
        retryAfter: rateLimitResult.retryAfter,
      };
    }

    // Validate password for signUp and passwordReset
    if (args.action === "signUp" || args.action === "passwordReset") {
      const passwordValidation = validatePassword(args.password);
      if (!passwordValidation.valid) {
        return {
          allowed: false,
          error: passwordValidation.error,
        };
      }
    }

    return { allowed: true };
  },
});

// Generic error message helper (prevents email enumeration)
export function getGenericAuthError(): string {
  return "Invalid email or password. Please try again.";
}
