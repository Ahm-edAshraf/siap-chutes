"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation } from "convex/react";
import {
  FilePlus,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useChutesAuth } from "@/contexts/AuthContext";
import { useDocumentSession } from "@/contexts/DocumentSessionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "./LanguageToggle";
import { HelpDialog } from "@/components/ui/HelpDialog";
import { useToast } from "@/components/ToastProvider";

const navItems = [
  {
    en: "Overview",
    bm: "Gambaran Keseluruhan",
    href: "/app",
    icon: LayoutDashboard,
  },
  { en: "New analysis", bm: "Analisis Baru", href: "/app/new", icon: FilePlus },
  { en: "Reports", bm: "Laporan", href: "/app/reports", icon: FileText },
  { en: "Documents", bm: "Dokumen", href: "/app/documents", icon: FolderOpen },
];

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useLanguage();
  const { logout } = useChutesAuth();
  const { clearDocuments } = useDocumentSession();
  const { toast } = useToast();
  const deleteAllData = useMutation(api.profiles.deleteAllData);

  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        t(
          "Permanently delete all your Siap data?",
          "Padam semua data Siap anda secara kekal?",
        ),
      )
    )
      return;
    try {
      await deleteAllData();
      clearDocuments();
      await logout();
    } catch {
      toast(t("Data deletion failed", "Pemadaman data gagal"), "error");
    }
  };
  const handleLogout = async () => {
    try {
      clearDocuments();
      await logout();
    } catch {
      toast(t("Sign out failed", "Log keluar gagal"), "error");
    }
  };

  return (
    <>
      <header className="md:hidden flex items-center justify-between p-4 border-b border-siap-ink bg-siap-paper sticky top-0 z-40">
        <Link href="/" className="font-serif text-xl font-semibold">
          Siap
        </Link>
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <button
            onClick={() => setIsOpen((value) => !value)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            className="p-1 rounded"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>
      {isOpen ? (
        <div className="md:hidden fixed inset-0 top-[65px] bg-siap-paper z-30 overflow-y-auto">
          <nav className="p-4 flex flex-col gap-2">
            {navItems.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded ${active ? "bg-siap-ink text-white" : "text-siap-ink/70"}`}
                >
                  <item.icon className="w-5 h-5" />
                  {t(item.en, item.bm)}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-siap-gray/30 space-y-2">
            <Link href="/privacy" className="mobile-menu-link">
              <Shield className="w-5 h-5" />
              {t("Privacy", "Privasi")}
            </Link>
            <button
              onClick={() => {
                setIsOpen(false);
                setIsHelpOpen(true);
              }}
              className="mobile-menu-link w-full"
            >
              <HelpCircle className="w-5 h-5" />
              {t("Help", "Bantuan")}
            </button>
            <button
              onClick={() => void handleDeleteAll()}
              className="mobile-menu-link w-full text-siap-red"
            >
              <Trash2 className="w-5 h-5" />
              {t("Delete all my data", "Padam semua data saya")}
            </button>
            <button
              onClick={() => void handleLogout()}
              className="mobile-menu-link w-full"
            >
              <LogOut className="w-5 h-5" />
              {t("Sign out", "Log keluar")}
            </button>
          </div>
        </div>
      ) : null}
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
