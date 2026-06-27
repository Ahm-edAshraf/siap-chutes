"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, HelpCircle, FileText, Mail } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const { t } = useLanguage();
  const dialogRef = useFocusTrap(isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-siap-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-dialog-title"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border border-siap-ink rounded-lg shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-siap-gray flex justify-between items-center bg-siap-gray/5">
              <h2
                id="help-dialog-title"
                className="font-serif text-lg font-medium flex items-center gap-2"
              >
                <HelpCircle className="w-5 h-5 text-siap-teal" />{" "}
                {t("Help & Support", "Bantuan & Sokongan")}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close help dialog"
                className="text-siap-ink/60 hover:text-siap-ink p-1 rounded-full hover:bg-siap-gray/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 flex-1 text-sm text-siap-ink/80">
              <p>
                {t(
                  "Siap turns application rules into evidence checks and a dependency-aware action plan for Malaysian students.",
                  "Siap menukar peraturan permohonan kepada semakan bukti dan pelan tindakan berkebergantungan untuk pelajar Malaysia.",
                )}
              </p>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-siap-teal/10 flex items-center justify-center text-siap-teal shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-siap-ink mb-1">
                      {t("Documentation", "Dokumentasi")}
                    </h3>
                    <p>
                      {t(
                        "Read our application guide to understand how Siap processes your documents locally.",
                        "Baca panduan permohonan kami untuk memahami bagaimana Siap memproses dokumen anda secara tempatan.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-siap-amber/10 flex items-center justify-center text-siap-amber shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-siap-ink mb-1">
                      {t("Contact Support", "Hubungi Sokongan")}
                    </h3>
                    <p>
                      {t(
                        "Use generated email drafts to request missing evidence from the responsible person or institution.",
                        "Gunakan draf e-mel yang dijana untuk meminta bukti yang hilang daripada individu atau institusi bertanggungjawab.",
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-siap-gray/10 p-3 rounded text-xs border border-siap-gray/30">
                <strong>{t("Privacy:", "Privasi:")}</strong>{" "}
                {t(
                  "Raw files stay on your device. Extracted text is sent transiently to verified Chutes TEE models and is not retained.",
                  "Fail mentah kekal pada peranti anda. Teks yang diekstrak dihantar sementara ke model TEE Chutes yang disahkan dan tidak disimpan.",
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
