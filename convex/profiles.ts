import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { deleteApplicationChildren } from "./lib/deletion";
import { profileFields } from "./validators";

function normalizedRequired(value: string, field: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters`);
  }
  return normalized;
}

function validPastIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value &&
    date <= new Date()
  );
}

const profileDoc = v.object({
  _id: v.id("profiles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  ...profileFields,
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const get = query({
  args: {},
  returns: v.union(v.null(), profileDoc),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const upsert = mutation({
  args: profileFields,
  returns: v.id("profiles"),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.householdIncome) || args.householdIncome < 0) {
      throw new Error("Household income must be a non-negative number");
    }
    if (!validPastIsoDate(args.dateOfBirth)) {
      throw new Error("Date of birth must be a valid past ISO date");
    }
    const fields = {
      name: normalizedRequired(args.name, "Name", 200),
      citizenship: normalizedRequired(args.citizenship, "Citizenship", 100),
      dateOfBirth: args.dateOfBirth,
      institution: normalizedRequired(args.institution, "Institution", 200),
      course: normalizedRequired(args.course, "Course", 200),
      studyLevel: normalizedRequired(args.studyLevel, "Study level", 100),
      householdIncome: args.householdIncome,
      documentFlags: args.documentFlags,
    };
    const user = await requireUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.patch("profiles", existing._id, {
        ...fields,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("profiles", {
      ...fields,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteAllData = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const application of applications) {
      await deleteApplicationChildren(ctx, application._id);
      await ctx.db.delete("applications", application._id);
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (profile) await ctx.db.delete("profiles", profile._id);

    const inventory = await ctx.db
      .query("inventoryDocuments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const document of inventory) {
      await ctx.db.delete("inventoryDocuments", document._id);
    }

    await ctx.db.delete("users", user._id);
    return null;
  },
});
