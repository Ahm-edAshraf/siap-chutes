"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role={t.type === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className={`pointer-events-auto flex items-center gap-3 py-3 px-4 rounded shadow-lg border max-w-sm ${
                t.type === "success"
                  ? "bg-siap-paper border-siap-green text-siap-ink"
                  : t.type === "error"
                    ? "bg-siap-paper border-siap-red text-siap-ink"
                    : "bg-siap-ink text-white border-siap-ink"
              }`}
            >
              {t.type === "success" && (
                <CheckCircle2 className="w-5 h-5 text-siap-green flex-shrink-0" />
              )}
              {t.type === "error" && (
                <AlertCircle className="w-5 h-5 text-siap-red flex-shrink-0" />
              )}
              {t.type === "info" && (
                <Info className="w-5 h-5 text-siap-teal flex-shrink-0" />
              )}

              <p className="text-sm font-medium flex-1">{t.message}</p>

              <button
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
                className="opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-siap-ink rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
