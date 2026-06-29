"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function isRequiredStage(stage: StageName) {
  return (
    stage === "requirement_compiler" || stage === "eligibility_mapper"
  );
}

export default function AnalysingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"applications">;
  const router = useRouter();
  const { t } = useLanguage();
  const { documents, clearDocuments } = useDocumentSession();
  const progress = useQuery(api.applications.getProgress, { id });
  const retry = useMutation(api.applications.retry);
  const remove = useMutation(api.applications.remove);
  const initialLaunch = useRef(false);
  const finalizing = useRef(false);
  const analysisDeadline = useRef<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [stageErrors, setStageErrors] = useState<
    Partial<Record<StageName, string>>
  >({});
  const [requestingStages, setRequestingStages] = useState<
    Partial<Record<StageName, boolean>>
  >({});

  const runStage = useCallback(
    async (stage: StageName) => {
      if (!documents) return false;
      setRequestingStages((current) => ({ ...current, [stage]: true }));
      setStageErrors((current) => {
        const next = { ...current };
        delete next[stage];
        return next;
      });
      try {
        if (
          analysisDeadline.current === null ||
          analysisDeadline.current <= Date.now()
        ) {
          analysisDeadline.current = Date.now() + 90_000;
        }
        const remainingMs = Math.max(
          1_000,
          analysisDeadline.current - Date.now(),
        );
        const response = await fetch(`/api/analyses/${id}/stages/${stage}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            documents,
            deadlineAt: analysisDeadline.current,
          }),
          signal: AbortSignal.timeout(remainingMs),
        });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "ANALYSIS_STAGE_FAILED");
        }
        return true;
      } catch (error) {
        const code =
          error instanceof Error ? error.message : "ANALYSIS_STAGE_FAILED";
        setStageErrors((current) => ({ ...current, [stage]: code }));
        return false;
      } finally {
        setRequestingStages((current) => ({ ...current, [stage]: false }));
      }
    },
    [documents, id],
  );

  const stages = useMemo<Stage[]>(
    () =>
      stageNames.map((name) => {
        const stored = progress?.stages.find((stage) => stage.stage === name);
        const modelRun = progress?.modelRuns.find(
          (run) => run.stage === name && run.outcome === "success",
        );
        const failed =
          stageErrors[name] !== undefined || stored?.status === "failed";
        return {
          id: name,
          label: t(...LABELS[name]),
          status:
            stored?.status === "complete"
              ? "complete"
              : failed && !isRequiredStage(name)
                ? "ready"
                : failed
                  ? "failed"
              : stored?.readyAt !== undefined
                ? "ready"
                : stored?.status === "running" || requestingStages[name]
                  ? "running"
                  : "queued",
          subEvents: [
            ...(progress?.events
              .filter((event) => event.stage === name)
              .map((event) =>
                event.type === "completed"
                  ? t(
                      event.messageKey.endsWith("deterministic_fallback")
                        ? "Bounded deterministic fallback completed"
                        : "Structured result verified and saved",
                      event.messageKey.endsWith("deterministic_fallback")
                        ? "Sandaran deterministik terhad selesai"
                        : "Hasil berstruktur disahkan dan disimpan",
                    )
                  : event.type === "started"
                    ? t(
                      "Confidential-compute stage started",
                      "Peringkat pengkomputeran sulit bermula",
                    )
                    : event.type === "retrying"
                      ? t(
                        "Retrying only this stage",
                        "Mencuba semula peringkat ini sahaja",
                      )
                    : !isRequiredStage(name)
                      ? t(
                          "Live agent ended safely; bounded deterministic fallback queued",
                          "Ejen langsung tamat dengan selamat; sandaran deterministik terhad dibariskan",
                        )
                    : t(
                        "Stage attempt failed safely; retry is isolated",
                        "Percubaan peringkat gagal dengan selamat; cuba semula diasingkan",
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
            ...(stageErrors[name]
              ? [
                  isRequiredStage(name)
                    ? t(
                        `Error code: ${stageErrors[name]}`,
                        `Kod ralat: ${stageErrors[name]}`,
                      )
                    : t(
                        "Deterministic fallback will preserve a complete report",
                        "Sandaran deterministik akan mengekalkan laporan lengkap",
                      ),
                ]
              : []),
          ],
        };
      }),
    [progress, requestingStages, stageErrors, t],
  );

  useEffect(() => {
    if (progress?.application.state === "complete") {
      clearDocuments();
      router.replace(`/app/reports/${id}`);
      return;
    }
    if (
      !documents ||
      !progress ||
      progress.application.state === "failed" ||
      initialLaunch.current
    ) {
      return;
    }
    const pending = stageNames.filter((name) => {
      const stage = progress.stages.find((candidate) => candidate.stage === name);
      return stage?.status === "pending";
    });
    if (pending.length === 0) return;
    initialLaunch.current = true;
    analysisDeadline.current = Date.now() + 90_000;
    void fetch("/api/auth/chutes/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("CHUTES_AUTH_REQUIRED");
        const body = (await response.json()) as { isSignedIn?: boolean };
        if (!body.isSignedIn) throw new Error("CHUTES_AUTH_REQUIRED");
        const required = pending.filter(
          (stage) =>
            stage === "requirement_compiler" ||
            stage === "eligibility_mapper",
        );
        const optional = pending.filter(
          (stage) =>
            stage === "red_team_reviewer" || stage === "action_planner",
        );
        const requiredRuns = required.map((stage) => runStage(stage));
        await Promise.race([
          Promise.all(requiredRuns),
          new Promise((resolve) => setTimeout(resolve, 20_000)),
        ]);
        const optionalRuns = optional.map((stage) => runStage(stage));
        await Promise.all([...requiredRuns, ...optionalRuns]);
      })
      .catch((error: unknown) => {
        setRequestError(
          error instanceof Error ? error.message : "CHUTES_AUTH_REQUIRED",
        );
      });
  }, [clearDocuments, documents, id, progress, router, runStage]);

  useEffect(() => {
    if (
      !documents ||
      !progress ||
      progress.application.state === "complete" ||
      progress.application.state === "failed" ||
      requestError !== null ||
      finalizing.current
    ) {
      return;
    }
    const byName = new Map(
      progress.stages.map((stage) => [stage.stage, stage]),
    );
    const requiredReady = (
      ["requirement_compiler", "eligibility_mapper"] as const
    ).every((name) => {
      const stage = byName.get(name);
      return stage?.status === "complete" || stage?.readyAt !== undefined;
    });
    const allSettled = progress.stages.every(
      (stage) =>
        stage.status === "complete" ||
        stage.status === "failed" ||
        stage.readyAt !== undefined,
    );
    if (!requiredReady || !allSettled) return;
    finalizing.current = true;
    void fetch(`/api/analyses/${id}/ensemble`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        documentNames: documents.map((document) => document.name),
      }),
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (response) => {
        if (response.status === 409) {
          finalizing.current = false;
          return;
        }
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "ANALYSIS_FINALIZATION_FAILED");
        }
      })
      .catch((error: unknown) => {
        finalizing.current = false;
        setRequestError(
          error instanceof Error
            ? error.message
            : "ANALYSIS_FINALIZATION_FAILED",
        );
      });
  }, [documents, id, progress, requestError]);

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
            if (progress.application.state !== "failed") {
              finalizing.current = false;
              setRequestError(null);
              return;
            }
            void retry({ id })
              .then(() => {
                initialLaunch.current = false;
                finalizing.current = false;
                analysisDeadline.current = null;
                setStageErrors({});
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
            "Four independent bounded Chutes TEE agents",
            "Empat ejen TEE Chutes bebas dan terhad",
          )}
        </div>
      </div>
      <div className="space-y-4">
        {stages.map((stage, index) => (
          <AnalysisStage
            key={stage.id}
            stage={stage}
            isActive={index === activeIndex}
            onRetry={
              stage.status === "failed" &&
              isRequiredStage(stage.id as StageName)
                ? () => void runStage(stage.id as StageName)
                : undefined
            }
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
