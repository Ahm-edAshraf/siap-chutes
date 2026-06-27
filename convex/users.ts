import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity } from "./lib/auth";

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      subject: v.string(),
      username: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      createdAt: v.number(),
      lastSeenAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique();
  },
});

export const sync = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const username =
      typeof identity.username === "string"
        ? identity.username
        : identity.subject;
    const name = typeof identity.name === "string" ? identity.name : undefined;
    const email =
      typeof identity.email === "string" ? identity.email : undefined;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch("users", existing._id, {
        username,
        name,
        email,
        lastSeenAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      subject: identity.subject,
      username,
      name,
      email,
      createdAt: now,
      lastSeenAt: now,
    });
  },
});
