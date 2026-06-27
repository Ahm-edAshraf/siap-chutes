"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Clock, Loader2, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { outcomeLabel, outcomeVariant } from "@/lib/presentation";

export default function ReportsPage() {
  const { t } = useLanguage();
  const applications = useQuery(api.applications.list);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  if (applications === undefined) {
    return (
      <div className="py-20 grid place-items-center">
        <Loader2 className="w-7 h-7 animate-spin text-siap-teal" />
      </div>
    );
  }
  const visible = applications.filter(
    (application) =>
      application.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || application.outcome === filter),
  );
  return (
    <div className="max-w-5xl mx-auto pb-12">
      <header className="mb-8">
        <h1 className="text-3xl font-serif font-medium">
          {t("Reports", "Laporan")}
        </h1>
        <p className="text-siap-ink/70 mt-2">
          {t(
            "Every report is stored until you delete it.",
            "Setiap laporan disimpan sehingga anda memadamkannya.",
          )}
        </p>
      </header>
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-siap-ink/45" />
          <span className="sr-only">{t("Search", "Cari")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search applications...", "Cari permohonan...")}
            className="w-full pl-10 pr-4 py-2 border border-siap-gray rounded bg-white text-sm"
          />
        </label>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="border border-siap-gray rounded px-3 py-2 bg-white text-sm"
        >
          <option value="all">{t("All outcomes", "Semua hasil")}</option>
          <option value="action_required">
            {t("Action required", "Tindakan diperlukan")}
          </option>
          <option value="ready_to_submit">
            {t("Ready to submit", "Sedia dihantar")}
          </option>
          <option value="likely_ineligible">
            {t("Likely ineligible", "Kemungkinan tidak layak")}
          </option>
          <option value="analysing">
            {t("Analysing", "Sedang dianalisis")}
          </option>
          <option value="failed">{t("Failed", "Gagal")}</option>
        </select>
      </div>
      {visible.length ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((application) => (
            <article
              key={application._id}
              className="bg-white border border-siap-gray rounded-lg flex flex-col"
            >
              <div className="p-5 border-b border-siap-gray/30 flex justify-between gap-3">
                <StatusBadge
                  label={outcomeLabel(application.outcome)}
                  variant={outcomeVariant(application.outcome)}
                />
                <span className="text-xs font-medium">
                  {application.readinessScore}%
                </span>
              </div>
              <div className="p-5 flex-1">
                <h2 className="font-serif text-lg font-medium">
                  {application.name}
                </h2>
                <p className="mt-4 text-sm text-siap-ink/65 flex gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  {application.deadline ??
                    t("Deadline not stated", "Tarikh tutup tidak dinyatakan")}
                </p>
              </div>
              <div className="p-4 bg-siap-gray/5">
                <Link
                  href={
                    application.state === "complete" ||
                    application.state === "failed"
                      ? `/app/reports/${application._id}`
                      : `/app/analysing/${application._id}`
                  }
                  className="flex justify-center gap-2 py-2 border border-siap-gray bg-white rounded text-sm font-medium"
                >
                  {t("Open", "Buka")}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={t("No reports found", "Tiada laporan ditemui")}
          description={t(
            "Adjust the search or create a new analysis.",
            "Ubah carian atau cipta analisis baru.",
          )}
          actionLabel={t("New analysis", "Analisis baru")}
          actionHref="/app/new"
        />
      )}
    </div>
  );
}
