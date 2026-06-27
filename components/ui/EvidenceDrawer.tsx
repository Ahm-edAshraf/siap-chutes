"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { RequirementView } from "@/lib/presentation";

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  requirement: RequirementView | null;
  onNext?: () => void;
  onPrev?: () => void;
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  requirement,
  onNext,
  onPrev,
}: EvidenceDrawerProps) {
  const { t } = useLanguage();
  const drawerRef = useFocusTrap(isOpen, onClose);

  // Prevent body scroll when open

  return (
    <AnimatePresence>
      {isOpen && requirement && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-siap-ink/20 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("Evidence Viewer", "Pemapar Bukti")}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-siap-paper border-l border-siap-ink z-50 shadow-2xl overflow-y-auto flex flex-col"
          >
            <div className="flex items-center justify-between p-4 rule-bottom bg-siap-paper sticky top-0 z-10">
              <h2 className="font-serif text-lg font-medium">
                {t("Evidence Viewer", "Pemapar Bukti")}
              </h2>
              <button
                onClick={onClose}
                aria-label={t("Close evidence viewer", "Tutup pemapar bukti")}
                className="p-2 hover:bg-siap-gray/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-medium text-siap-ink/60 uppercase tracking-wider mb-2">
                  {t("Requirement", "Keperluan")}
                </h3>
                <p className="font-medium text-lg">{requirement.label}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-siap-ink/60 uppercase tracking-wider mb-2">
                  {t("Source Document", "Dokumen Sumber")}
                </h3>
                <div className="flex items-center gap-2 text-siap-teal font-medium mb-4">
                  <FileText className="w-4 h-4" />
                  {requirement.source}
                </div>

                <div className="bg-white border border-siap-gray rounded shadow-sm p-8 min-h-[180px] text-sm leading-relaxed text-siap-charcoal font-serif relative">
                  <div className="absolute top-4 right-4 text-xs text-siap-gray/60">
                    {t("Page", "Halaman")} {requirement.pageNumber || 1}
                  </div>

                  <div className="pt-8">
                    <p className="bg-siap-teal/10 border-l-4 border-siap-teal pl-3 py-1 my-4 text-siap-ink font-medium">
                      {requirement.evidence}
                    </p>
                    <p className="text-xs text-siap-ink/60 font-sans">
                      {requirement.citationVerified
                        ? t(
                            "Exact excerpt verified against the selected page.",
                            "Petikan tepat disahkan dengan halaman yang dipilih.",
                          )
                        : t(
                            "Excerpt could not be matched exactly and requires manual verification.",
                            "Petikan tidak dapat dipadankan dengan tepat dan memerlukan pengesahan manual.",
                          )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-siap-gray/10 rounded p-4 border border-siap-gray/30">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">
                    {t("Confidence Score", "Skor Keyakinan")}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      requirement.confidence === "high"
                        ? "bg-siap-green/20 text-siap-green"
                        : requirement.confidence === "medium"
                          ? "bg-siap-amber/20 text-siap-amber"
                          : "bg-siap-red/20 text-siap-red"
                    }`}
                  >
                    {requirement.confidence === "high"
                      ? t("High", "Tinggi")
                      : requirement.confidence === "medium"
                        ? t("Medium", "Sederhana")
                        : t("Low", "Rendah")}
                  </span>
                </div>
                <p className="text-xs text-siap-ink/70">
                  {t(
                    "Reviewed through Chutes confidential compute. Only this short citation is retained.",
                    "Disemak melalui pengkomputeran sulit Chutes. Hanya petikan pendek ini disimpan.",
                  )}
                </p>
              </div>
            </div>

            <div className="p-4 rule-top bg-siap-paper sticky bottom-0 flex justify-between">
              <button
                onClick={onPrev}
                disabled={!onPrev}
                className="flex items-center gap-1 text-sm font-medium hover:text-siap-teal disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />{" "}
                {t("Previous", "Sebelumnya")}
              </button>
              <button
                onClick={onNext}
                disabled={!onNext}
                className="flex items-center gap-1 text-sm font-medium hover:text-siap-teal disabled:opacity-30 transition-colors"
              >
                {t("Next", "Seterusnya")} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
