import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();
  if (!user) {
    throw new Error("User has not been synchronized");
  }
  return user;
}

export async function requireAnalysisService(ctx: Ctx) {
  const identity = await requireIdentity(ctx);
  if (identity.role !== "analysis_service") {
    throw new Error("Unauthorized");
  }
  return identity;
}

export async function requireOwnedApplication(
  ctx: Ctx,
  applicationId: Doc<"applications">["_id"],
) {
  const user = await requireUser(ctx);
  const application = await ctx.db.get("applications", applicationId);
  if (!application || application.userId !== user._id) {
    throw new Error("Application not found");
  }
  return { application, user };
}
