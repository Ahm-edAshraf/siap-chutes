"use client";

import React from "react";
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
  Shield,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useChutesAuth } from "@/contexts/AuthContext";
import { useDocumentSession } from "@/contexts/DocumentSessionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { HelpDialog } from "@/components/ui/HelpDialog";
import { LanguageToggle } from "@/components/LanguageToggle";
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

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { user, logout } = useChutesAuth();
  const { clearDocuments } = useDocumentSession();
  const { toast } = useToast();
  const deleteAllData = useMutation(api.profiles.deleteAllData);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);

  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      t(
        "Delete your profile, reports, actions, and inventory permanently? This cannot be undone.",
        "Padam profil, laporan, tindakan dan inventori anda secara kekal? Tindakan ini tidak boleh dibuat asal.",
      ),
    );
    if (!confirmed) return;
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
    <aside className="hidden md:flex flex-col w-64 h-screen border-r border-siap-ink bg-siap-paper sticky top-0">
      <div className="p-6 rule-bottom">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-serif text-2xl font-semibold text-siap-ink">
            Siap
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest bg-siap-ink text-white px-1.5 py-0.5 rounded-sm">
            BETA
          </span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                active
                  ? "bg-siap-ink text-white"
                  : "text-siap-ink/70 hover:text-siap-ink hover:bg-siap-gray/20"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium text-sm">{t(item.en, item.bm)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 rule-top bg-siap-gray/5">
        <div className="mb-4">
          <LanguageToggle />
        </div>
        <div className="space-y-2 mb-4">
          <Link href="/privacy" className="sidebar-link">
            <Shield className="w-4 h-4" />
            {t("Privacy", "Privasi")}
          </Link>
          <button
            onClick={() => setIsHelpOpen(true)}
            className="sidebar-link w-full"
          >
            <HelpCircle className="w-4 h-4" />
            {t("Help", "Bantuan")}
          </button>
          <button
            onClick={() => void handleDeleteAll()}
            className="sidebar-link w-full text-siap-red/80 hover:text-siap-red"
          >
            <Trash2 className="w-4 h-4" />
            {t("Delete all my data", "Padam semua data saya")}
          </button>
          <button
            onClick={() => void handleLogout()}
            className="sidebar-link w-full"
          >
            <LogOut className="w-4 h-4" />
            {t("Sign out", "Log keluar")}
          </button>
        </div>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-siap-teal/20 border border-siap-teal/30 flex items-center justify-center text-siap-teal font-medium">
            {(user?.name ?? user?.username ?? "S").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-siap-ink truncate">
              {user?.name ?? user?.username}
            </p>
            <p className="text-xs text-siap-ink/60">
              {t("Chutes account", "Akaun Chutes")}
            </p>
          </div>
        </div>
      </div>
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </aside>
  );
}
