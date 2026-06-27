"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { ToastProvider } from "./ToastProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-siap-paper">
        <Sidebar />
        <div className="flex-1 flex flex-col h-full relative">
          <MobileHeader />
          <main className="flex-1 overflow-y-auto w-full">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-8 md:py-12">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
