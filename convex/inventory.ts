import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { documentStatus } from "./validators";

const inventoryDoc = v.object({
  _id: v.id("inventoryDocuments"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  status: documentStatus,
  lastUpdatedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const list = query({
  args: {},
  returns: v.array(inventoryDoc),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("inventoryDocuments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    name: v.string(),
    status: documentStatus,
    lastUpdatedAt: v.optional(v.number()),
  },
  returns: v.id("inventoryDocuments"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Document name is required");
    if (name.length > 200) {
      throw new Error("Document name must not exceed 200 characters");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("inventoryDocuments")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", user._id).eq("name", name),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("inventoryDocuments", existing._id, {
        status: args.status,
        lastUpdatedAt: args.lastUpdatedAt,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("inventoryDocuments", {
      userId: user._id,
      name,
      status: args.status,
      lastUpdatedAt: args.lastUpdatedAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const document = await ctx.db.get("inventoryDocuments", args.id);
    if (!document || document.userId !== user._id) {
      throw new Error("Document not found");
    }
    await ctx.db.delete("inventoryDocuments", document._id);
    return null;
  },
});
