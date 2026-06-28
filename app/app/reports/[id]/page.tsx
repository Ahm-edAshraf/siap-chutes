"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ActionTimeline } from "@/components/ui/ActionTimeline";
import { EvidenceDrawer } from "@/components/ui/EvidenceDrawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { RequirementRow } from "@/components/ui/RequirementRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  outcomeLabel,
  outcomeVariant,
  requirementStatus,
  type ActionView,
  type RequirementView,
} from "@/lib/presentation";

type Evidence = {
  documentName: string;
  pageNumber?: number;
  excerpt: string;
  confidence: "high" | "medium" | "low";
  citationVerified: boolean;
};
type Bundle = {
  application: {
    _id: Id<"applications">;
    name: string;
    sourceFileName: string;
    state: string;
    outcome: string;
    deadline?: string;
    summary?: string;
    readinessScore: number;
    evidenceScore: number;
    actionScore: number;
    errorCode?: string;
  };
  requirements: Array<{
    _id: Id<"requirements">;
    label: string;
    state: string;
    citationVerified: boolean;
    evidence: Evidence[];
  }>;
  missingDocuments: Array<{
    _id: Id<"missingDocuments">;
    name: string;
    urgency: "critical" | "required" | "optional";
    owner: string;
    suggestedDate: string;
    action: string;
  }>;
  actions: Array<{
    _id: Id<"actionItems">;
    description: string;
    status: "pending" | "completed";
    dependencies: Id<"actionItems">[];
    emailDraft?: string;
  }>;
  modelRuns: Array<{
    _id: string;
    stage: string;
    model: string;
    confidentialCompute: boolean;
    durationMs: number;
  }>;
};

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"applications">;
  const router = useRouter();
  const { t } = useLanguage();
  const { toast } = useToast();
  const rawBundle = useQuery(api.applications.get, { id });
  const setCompleted = useMutation(api.actions.setCompleted);
  const remove = useMutation(api.applications.remove);
  const bundle = rawBundle as Bundle | null | undefined;
  const [activeEvidence, setActiveEvidence] = useState<RequirementView | null>(
    null,
  );
  const [showEmail, setShowEmail] = useState(false);
  const emailRef = useFocusTrap(showEmail, () => setShowEmail(false));

  const requirements = useMemo<RequirementView[]>(
    () =>
      bundle?.requirements.map((requirement) => {
        const evidence = requirement.evidence.at(-1);
        return {
          id: requirement._id,
          label: requirement.label,
          status: requirementStatus(requirement.state),
          evidence:
            evidence?.excerpt ??
            t("No supporting excerpt", "Tiada petikan sokongan"),
          confidence: evidence?.confidence ?? "low",
          source: evidence
            ? `${evidence.documentName}${evidence.pageNumber ? ` · p. ${evidence.pageNumber}` : ""}`
            : t("No citation", "Tiada petikan"),
          pageNumber: evidence?.pageNumber,
          citationVerified: evidence?.citationVerified ?? false,
        };
      }) ?? [],
    [bundle, t],
  );
  const actions = useMemo<ActionView[]>(
    () =>
      bundle?.actions.map((action) => ({
        id: action._id,
        description: action.description,
        dependencies: action.dependencies,
        status: action.status,
        emailDraft: action.emailDraft,
      })) ?? [],
    [bundle],
  );

  if (bundle === undefined) {
    return (
      <div className="py-20 grid place-items-center">
        <Loader2 className="w-7 h-7 animate-spin text-siap-teal" />
      </div>
    );
  }
  if (bundle === null) {
    return (
      <ErrorState
        title={t("Report not found", "Laporan tidak ditemui")}
        description={t(
          "It may have been deleted or belongs to another account.",
          "Ia mungkin telah dipadam atau milik akaun lain.",
        )}
      />
    );
  }
  const application = bundle.application;
  const confirmed = bundle.requirements.filter(
    (item) => item.state === "confirmed",
  ).length;
  const incomplete = bundle.requirements.filter(
    (item) => item.state === "incomplete" || item.state === "not_met",
  ).length;
  const verify = bundle.requirements.filter(
    (item) => item.state === "needs_verification",
  ).length;
  const completedActions = bundle.actions.filter(
    (action) => action.status === "completed",
  ).length;
  const emailAction = bundle.actions.find((action) => action.emailDraft);

  const exportReport = () => {
    const safeExport = {
      application,
      requirements: bundle.requirements,
      missingDocuments: bundle.missingDocuments,
      actions: bundle.actions,
      modelRuns: bundle.modelRuns,
      exportedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(safeExport, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${application.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast(t("Report exported", "Laporan dieksport"), "success");
  };

  const deleteReport = async () => {
    if (
      !window.confirm(
        t("Permanently delete this report?", "Padam laporan ini secara kekal?"),
      )
    )
      return;
    try {
      await remove({ id });
      router.replace("/app/reports");
    } catch {
      toast(t("Report deletion failed", "Pemadaman laporan gagal"), "error");
    }
  };

  const updateAction = async (
    actionId: Id<"actionItems">,
    completed: boolean,
  ) => {
    try {
      await setCompleted({ id: actionId, completed });
      return true;
    } catch {
      toast(
        t(
          "Complete dependent actions in order",
          "Lengkapkan tindakan bergantung mengikut turutan",
        ),
        "error",
      );
      return false;
    }
  };

  const activeIndex = activeEvidence
    ? requirements.findIndex((item) => item.id === activeEvidence.id)
    : -1;

  return (
    <div className="pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-medium">
            {application.name}
          </h1>
          <div className="flex flex-wrap gap-3 mt-3 items-center text-sm text-siap-ink/70">
            <span>
              {t("Deadline", "Tarikh tutup")}:{" "}
              {application.deadline ?? t("Not stated", "Tidak dinyatakan")}
            </span>
            <StatusBadge
              label={outcomeLabel(application.outcome)}
              variant={outcomeVariant(application.outcome)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {application.state === "failed" ? (
            <button
              onClick={() => router.push(`/app/new?resume=${id}`)}
              className="report-button"
            >
              <RotateCcw className="w-4 h-4" />
              {t("Retry", "Cuba lagi")}
            </button>
          ) : null}
          <button onClick={exportReport} className="report-button">
            <Download className="w-4 h-4" />
            {t("Export", "Eksport")}
          </button>
          <button
            onClick={() => void deleteReport()}
            className="report-button text-siap-red"
          >
            <Trash2 className="w-4 h-4" />
            {t("Delete", "Padam")}
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-12 gap-6 mb-10">
        <div className="md:col-span-8 bg-white border border-siap-ink rounded p-6">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-7 h-7 text-siap-teal shrink-0 mt-0.5" />
            <div>
              <p className="font-serif text-xl font-medium">
                {application.summary ?? outcomeLabel(application.outcome)}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm">
                <span className="text-siap-green">
                  {confirmed} {t("confirmed", "disahkan")}
                </span>
                <span className="text-siap-amber">
                  {verify} {t("verify", "semak")}
                </span>
                <span className="text-siap-red">
                  {incomplete} {t("not ready", "belum sedia")}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="md:col-span-4 bg-siap-gray/10 border border-siap-gray rounded p-5">
          <h2 className="text-xs uppercase tracking-wider font-medium text-siap-ink/60 mb-3">
            {t("Application checklist", "Senarai semak permohonan")}
          </h2>
          <p className="text-sm">
            {confirmed} {t("of", "daripada")} {bundle.requirements.length}{" "}
            {t("requirements confirmed", "keperluan disahkan")}
          </p>
          <p className="text-sm mt-2">
            {completedActions} {t("of", "daripada")} {bundle.actions.length}{" "}
            {t("actions completed", "tindakan selesai")}
          </p>
        </div>
      </div>

      {bundle.missingDocuments.length ? (
        <section className="mb-10">
          <h2 className="text-2xl font-serif font-medium mb-5">
            {t("Missing documents", "Dokumen hilang")}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bundle.missingDocuments.map((document) => (
              <div
                key={document._id}
                className="bg-white border border-siap-gray rounded p-5"
              >
                <StatusBadge
                  label={
                    document.urgency.charAt(0).toUpperCase() +
                    document.urgency.slice(1)
                  }
                  variant={
                    document.urgency === "critical" ? "error" : "warning"
                  }
                />
                <h3 className="font-medium mt-3">{document.name}</h3>
                <p className="text-sm text-siap-ink/60 mt-1">
                  {document.owner} · {document.suggestedDate}
                </p>
                {document.action.toLowerCase().includes("email") &&
                emailAction ? (
                  <button
                    onClick={() => setShowEmail(true)}
                    className="text-sm font-medium text-siap-teal mt-3 hover:underline"
                  >
                    {document.action}
                  </button>
                ) : (
                  <p className="text-sm mt-3">{document.action}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-12 gap-10">
        <section className="lg:col-span-8">
          <h2 className="text-2xl font-serif font-medium mb-5">
            {t("Eligibility checks", "Semakan kelayakan")}
          </h2>
          <div className="bg-white border-y border-siap-ink px-4">
            {requirements.map((requirement) => (
              <RequirementRow
                key={requirement.id}
                requirement={requirement}
                onSourceClick={setActiveEvidence}
              />
            ))}
          </div>
        </section>
        <aside className="lg:col-span-4">
          <div className="sticky top-24 bg-white border border-siap-ink rounded p-6">
            <h2 className="text-lg font-serif font-medium mb-6">
              {t("Ordered action plan", "Pelan tindakan tersusun")}
            </h2>
            <ActionTimeline
              actions={actions}
              onToggleAction={(actionId) => {
                const action = actions.find((item) => item.id === actionId);
                if (action) {
                  void updateAction(
                    actionId as Id<"actionItems">,
                    action.status !== "completed",
                  );
                }
              }}
            />
          </div>
        </aside>
      </div>

      <EvidenceDrawer
        isOpen={activeEvidence !== null}
        onClose={() => setActiveEvidence(null)}
        requirement={activeEvidence}
        onPrev={
          activeIndex > 0
            ? () => setActiveEvidence(requirements[activeIndex - 1])
            : undefined
        }
        onNext={
          activeIndex >= 0 && activeIndex < requirements.length - 1
            ? () => setActiveEvidence(requirements[activeIndex + 1])
            : undefined
        }
      />

      {showEmail && emailAction?.emailDraft ? (
        <div className="fixed inset-0 bg-siap-ink/25 backdrop-blur-sm z-50 grid place-items-center p-4">
          <div
            ref={emailRef}
            role="dialog"
            aria-modal="true"
            className="bg-white border border-siap-ink rounded-lg shadow-2xl max-w-lg w-full"
          >
            <div className="p-4 border-b flex justify-between">
              <h2 className="font-serif text-lg">
                {t("Draft request", "Draf permintaan")}
              </h2>
              <button onClick={() => setShowEmail(false)}>
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <pre className="p-6 whitespace-pre-wrap text-sm font-sans max-h-80 overflow-auto">
              {emailAction.emailDraft}
            </pre>
            <div className="p-4 border-t flex justify-between">
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(emailAction.emailDraft!)
                    .then(() =>
                      toast(t("Draft copied", "Draf disalin"), "success"),
                    )
                    .catch(() =>
                      toast(t("Copy failed", "Salinan gagal"), "error"),
                    );
                }}
                className="inline-flex items-center gap-2 text-sm"
              >
                <Copy className="w-4 h-4" />
                {t("Copy", "Salin")}
              </button>
              <button
                onClick={() => {
                  void updateAction(emailAction._id, true).then((updated) => {
                    if (updated) setShowEmail(false);
                  });
                }}
                className="inline-flex items-center gap-2 bg-siap-ink text-white px-4 py-2 rounded text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t("Mark sent", "Tandakan dihantar")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
