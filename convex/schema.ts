import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
export const role = v.union(v.literal("admin"), v.literal("security"), v.literal("staff"), v.literal("report"));
export const kind = v.union(v.literal("visitor"), v.literal("contractor"), v.literal("supplier"));
export default defineSchema({
  ...authTables,
  departments: defineTable({ name: v.string() }).index("by_name", ["name"]),
  profiles: defineTable({ userId: v.id("users"), name: v.string(), email: v.string(), role, active: v.optional(v.boolean()), departmentId: v.optional(v.id("departments")) })
    .index("by_user", ["userId"]),
  passcodes: defineTable({
    codeHash: v.string(),
    visitorName: v.string(),
    kind,
    company: v.optional(v.string()),
    hostDepartmentId: v.optional(v.id("departments")),
    hostName: v.optional(v.string()),
    issuedBy: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    checkedInAt: v.optional(v.number()),
    checkedInBy: v.optional(v.string()),
    badgeNumber: v.optional(v.string()),
    idType: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    vehiclePlate: v.optional(v.string()),
    notes: v.optional(v.string()),
    checkedOutAt: v.optional(v.number()),
    checkedOutBy: v.optional(v.string()),
    checkoutNotes: v.optional(v.string()),
  }).index("by_hash", ["codeHash"]),
  gateEvents: defineTable({ passcodeId: v.optional(v.id("passcodes")), guardId: v.id("users"), result: v.string(), at: v.number() }),
  failures: defineTable({ at: v.number() }).index("by_at", ["at"]),
  notifications: defineTable({ userId: v.id("users"), kind: v.string(), message: v.string(), at: v.number(), read: v.boolean() }).index("by_user", ["userId", "at"]),
  settings: defineTable({ orgName: v.string(), accent: v.string(), defaultHours: v.number(), maxHours: v.number() }),
  audit: defineTable({ userId: v.optional(v.id("users")), name: v.string(), action: v.string(), detail: v.string(), ok: v.boolean(), at: v.number() }).index("by_time", ["at"]),
  csrfTokens: defineTable({ token: v.string(), userId: v.id("users"), expiresAt: v.number() }).index("by_token", ["token"]),
  rateLimits: defineTable({ 
    identifier: v.string(), 
    action: v.string(), 
    attempts: v.number(), 
    windowStart: v.number(), 
    expiresAt: v.number() 
  }).index("by_identifier_action", ["identifier", "action"]),
});
