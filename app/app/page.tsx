"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
  Clock,
  FilePlus,
  Loader2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDeadline } from "@/lib/date-time";
import { outcomeLabel, outcomeVariant } from "@/lib/presentation";

export default function OverviewDashboard() {
  const { lang, t } = useLanguage();
  const profile = useQuery(api.profiles.get);
  const applications = useQuery(api.applications.list);
  if (applications === undefined) {
    return (
      <div className="py-20 grid place-items-center">
        <Loader2 className="w-7 h-7 animate-spin text-siap-teal" />
      </div>
    );
  }
  const analysing = applications.filter(
    (application) => application.outcome === "analysing",
  ).length;
  const ready = applications.filter(
    (application) => application.outcome === "ready_to_submit",
  ).length;
  const attention = applications.filter(
    (application) =>
      application.outcome === "action_required" ||
      application.outcome === "likely_ineligible",
  ).length;
  const firstName = profile?.name.split(/\s+/)[0];
  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium">
            {t("Application workspace", "Ruang kerja permohonan")}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-siap-ink/70 mt-2">
            {t(
              "Persistent reports and actions from your Chutes account.",
              "Laporan dan tindakan kekal daripada akaun Chutes anda.",
            )}
          </p>
        </div>
        <Link
          href="/app/new"
          className="inline-flex items-center gap-2 bg-siap-ink text-white px-5 py-2.5 rounded font-medium"
        >
          <FilePlus className="w-4 h-4" />
          {t("New analysis", "Analisis baru")}
        </Link>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 border-y border-siap-ink py-6">
        {[
          [
            applications.length,
            t("Applications", "Permohonan"),
            "text-siap-ink",
          ],
          [analysing, t("Analysing", "Sedang dianalisis"), "text-siap-teal"],
          [
            attention,
            t("Need attention", "Perlu perhatian"),
            "text-siap-amber",
          ],
          [ready, t("Ready to submit", "Sedia dihantar"), "text-siap-green"],
        ].map(([value, label, colour]) => (
          <div key={String(label)}>
            <p className={`text-3xl font-serif font-medium ${colour}`}>
              {value}
            </p>
            <p className="text-sm text-siap-ink/70 mt-1">{label}</p>
          </div>
        ))}
      </div>
      <section>
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-serif font-medium">
            {t("Recent applications", "Permohonan terkini")}
          </h2>
          <Link
            href="/app/reports"
            className="text-sm text-siap-teal font-medium flex items-center gap-1"
          >
            {t("View all", "Lihat semua")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {applications.length ? (
          <div className="border border-siap-ink rounded-lg overflow-hidden bg-white">
            {applications.slice(0, 5).map((application, index) => (
              <div
                key={application._id}
                className={`p-5 flex flex-col md:flex-row md:items-center gap-5 ${index < Math.min(applications.length, 5) - 1 ? "rule-bottom" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-3 items-center">
                    <h3 className="font-medium text-lg truncate">
                      {application.name}
                    </h3>
                    <StatusBadge
                      label={outcomeLabel(application.outcome)}
                      variant={outcomeVariant(application.outcome)}
                    />
                  </div>
                  <p className="text-sm text-siap-ink/60 mt-2 flex items-center gap-2">
                    {application.deadline ? (
                      <>
                        <Clock className="w-4 h-4" />
                        {t("Deadline", "Tarikh tutup")}:{" "}
                        {formatDeadline(application.deadline, lang)}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        {t(
                          "No deadline detected",
                          "Tiada tarikh tutup dikesan",
                        )}
                      </>
                    )}
                  </p>
                </div>
                <Link
                  href={
                    application.state === "complete" ||
                    application.state === "failed"
                      ? `/app/reports/${application._id}`
                      : `/app/analysing/${application._id}`
                  }
                  className="px-4 py-2 border border-siap-ink rounded text-sm font-medium text-center"
                >
                  {application.state === "complete"
                    ? t("View report", "Lihat laporan")
                    : t("View progress", "Lihat kemajuan")}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t("No applications yet", "Belum ada permohonan")}
            description={t(
              "Run a real analysis to create your first persistent report.",
              "Jalankan analisis sebenar untuk mencipta laporan kekal pertama anda.",
            )}
            actionLabel={t("New analysis", "Analisis baru")}
            actionHref="/app/new"
          />
        )}
      </section>
    </div>
  );
}
