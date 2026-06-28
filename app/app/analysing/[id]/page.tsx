"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FileUp, Loader2, Shield, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AnalysisStage, type Stage } from "@/components/ui/AnalysisStage";
import { ErrorState } from "@/components/ui/ErrorState";
import { useDocumentSession } from "@/contexts/DocumentSessionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { stageNames, type StageName } from "@/lib/analysis/schemas";

const LABELS: Record<StageName, [string, string]> = {
  requirement_compiler: ["Reading requirements", "Membaca keperluan"],
  eligibility_mapper: [
    "Checking eligibility evidence",
    "Menyemak bukti kelayakan",
  ],
  red_team_reviewer: ["Challenging assumptions", "Mencabar andaian"],
  action_planner: ["Building the action plan", "Membina pelan tindakan"],
};

export default function AnalysingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"applications">;
  const router = useRouter();
  const { t } = useLanguage();
  const { documents, clearDocuments } = useDocumentSession();
  const progress = useQuery(api.applications.getProgress, { id });
  const retry = useMutation(api.applications.retry);
  const remove = useMutation(api.applications.remove);
  const requested = useRef(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const stages = useMemo<Stage[]>(
    () =>
      stageNames.map((name) => {
        const stored = progress?.stages.find((stage) => stage.stage === name);
        const modelRun = progress?.modelRuns.find(
          (run) => run.stage === name && run.outcome === "success",
        );
        return {
          id: name,
          label: t(...LABELS[name]),
          status:
            stored?.status === "complete"
              ? "complete"
              : stored?.readyAt !== undefined
                ? "ready"
                : stored?.status === "running"
                  ? "running"
                  : "queued",
          subEvents: [
            ...(progress?.events
              .filter((event) => event.stage === name)
              .map((event) =>
                event.type === "completed"
                  ? t(
                      "Structured result verified and saved",
                      "Hasil berstruktur disahkan dan disimpan",
                    )
                  : event.type === "started"
                    ? t(
                        "Confidential-compute stage started",
                        "Peringkat pengkomputeran sulit bermula",
                      )
                    : t(
                        "Stage failed safely",
                        "Peringkat gagal dengan selamat",
                      ),
              ) ?? []),
            ...(modelRun
              ? [
                  t(
                    `${modelRun.model} returned verified TEE output in ${(modelRun.durationMs / 1_000).toFixed(1)}s`,
                    `${modelRun.model} mengembalikan output TEE yang disahkan dalam ${(modelRun.durationMs / 1_000).toFixed(1)}s`,
                  ),
                ]
              : []),
          ],
        };
      }),
    [progress, t],
  );

  useEffect(() => {
    if (progress?.application.state === "complete") {
      clearDocuments();
      router.replace(`/app/reports/${id}`);
      return;
    }
    if (!documents || !progress || progress.application.state === "failed")
      return;
    if (
      requested.current ||
      !progress.stages.some((stage) => stage.status === "pending")
    )
      return;
    requested.current = true;
    void fetch(`/api/analyses/${id}/ensemble`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documents }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Analysis stage failed");
        }
      })
      .catch((error: unknown) => {
        setRequestError(
          error instanceof Error ? error.message : "Analysis stage failed",
        );
      });
  }, [clearDocuments, documents, id, progress, router]);

  if (progress === undefined) {
    return (
      <div className="py-20 grid place-items-center">
        <Loader2 className="w-7 h-7 animate-spin text-siap-teal" />
      </div>
    );
  }
  if (progress === null) {
    return (
      <ErrorState
        title={t("Application not found", "Permohonan tidak ditemui")}
        description={t(
          "This report was deleted or belongs to another account.",
          "Laporan ini telah dipadam atau milik akaun lain.",
        )}
      />
    );
  }
  if (!documents && progress.application.state !== "complete") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <FileUp className="w-10 h-10 mx-auto text-siap-teal mb-4" />
        <h1 className="text-2xl font-serif font-medium">
          {t("Select source files again", "Pilih semula fail sumber")}
        </h1>
        <p className="text-siap-ink/65 mt-2 mb-6">
          {t(
            "Raw documents and extracted text are intentionally not persisted across reloads.",
            "Dokumen mentah dan teks yang diekstrak sengaja tidak disimpan selepas muat semula.",
          )}
        </p>
        <Link
          href={`/app/new?resume=${id}`}
          className="inline-flex bg-siap-ink text-white px-5 py-2.5 rounded font-medium"
        >
          {t("Reselect files", "Pilih semula fail")}
        </Link>
      </div>
    );
  }
  if (progress.application.state === "failed" || requestError) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <ErrorState
          title={t("Analysis failed safely", "Analisis gagal dengan selamat")}
          description={`${t("No raw content was stored. Error code:", "Tiada kandungan mentah disimpan. Kod ralat:")} ${progress.application.errorCode ?? requestError ?? "ANALYSIS_STAGE_FAILED"}`}
          onRetry={() => {
            void retry({ id })
              .then(() => {
                requested.current = false;
                setRequestError(null);
              })
              .catch(() => setRequestError("RETRY_REQUEST_FAILED"));
          }}
        />
      </div>
    );
  }

  const readyCount = progress.stages.filter(
    (stage) => stage.status === "complete" || stage.readyAt !== undefined,
  ).length;
  const activeIndex = progress.stages.findIndex(
    (stage) => stage.status === "running" && stage.readyAt === undefined,
  );
  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-10 text-center flex flex-col items-center">
        <p className="text-xs uppercase tracking-[0.18em] text-siap-ink/55">
          {t(
            `${readyCount} of ${progress.stages.length} agent responses ready`,
            `${readyCount} daripada ${progress.stages.length} respons ejen sedia`,
          )}
        </p>
        <h1 className="text-3xl font-serif font-medium mt-4 flex items-center gap-3">
          {t("Analysing application", "Menganalisis permohonan")}
          <Loader2 className="w-6 h-6 text-siap-teal animate-spin" />
        </h1>
        <div className="flex items-center gap-2 text-xs font-medium text-siap-teal mt-3 bg-siap-teal/10 px-3 py-1 rounded-full">
          <Shield className="w-3.5 h-3.5" />
          {t(
            "Four independent Chutes TEE agents running in parallel",
            "Empat ejen TEE Chutes bebas berjalan secara selari",
          )}
        </div>
      </div>
      <div className="space-y-4">
        {stages.map((stage, index) => (
          <AnalysisStage
            key={stage.id}
            stage={stage}
            isActive={index === activeIndex}
          />
        ))}
      </div>
      <div className="mt-10 text-center">
        <button
          onClick={() => {
            void remove({ id })
              .then(() => {
                clearDocuments();
                router.replace("/app/new");
              })
              .catch(() => setRequestError("DELETE_REQUEST_FAILED"));
          }}
          className="inline-flex items-center gap-2 text-sm text-siap-ink/60 hover:text-siap-red"
        >
          <X className="w-4 h-4" />
          {t("Cancel and delete", "Batal dan padam")}
        </button>
      </div>
    </div>
  );
}
