"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
  useMutation,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthProvider, useChutesAuth } from "@/contexts/AuthContext";
import { DocumentSessionProvider } from "@/contexts/DocumentSessionContext";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
const convex = new ConvexReactClient(convexUrl);

function SyncUser({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const sync = useMutation(api.users.sync);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    void sync()
      .then(() => setSynced(true))
      .catch(() => setSyncError(true));
  }, [isAuthenticated, sync]);
  if (syncError) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-siap-red">
        The workspace could not connect. Check the Convex deployment
        configuration.
      </div>
    );
  }
  if (isAuthenticated && !synced) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-siap-ink/60">
        Connecting your encrypted workspace...
      </div>
    );
  }
  return children;
}

function useConvexChutesAuth() {
  return useChutesAuth();
}

function ConvexBridge({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useConvexChutesAuth}>
      <SyncUser>{children}</SyncUser>
    </ConvexProviderWithAuth>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ConvexBridge>
        <DocumentSessionProvider>{children}</DocumentSessionProvider>
      </ConvexBridge>
    </AuthProvider>
  );
}
