"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  const toggle = () => {
    setLang(lang === "EN" ? "BM" : "EN");
  };

  return (
    <button
      onClick={toggle}
      aria-label={`Toggle Language. Current language is ${lang === "EN" ? "English" : "Bahasa Melayu"}`}
      className="flex items-center text-xs font-medium border border-siap-gray rounded overflow-hidden transition-colors"
      title="Toggle Language"
    >
      <span
        className={`px-2 py-1 ${lang === "EN" ? "bg-siap-ink text-white" : "bg-transparent text-siap-ink/60 hover:text-siap-ink"}`}
      >
        EN
      </span>
      <span
        className={`px-2 py-1 ${lang === "BM" ? "bg-siap-ink text-white" : "bg-transparent text-siap-ink/60 hover:text-siap-ink"}`}
      >
        BM
      </span>
    </button>
  );
}
