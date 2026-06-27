"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  Shield,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { useDocumentSession } from "@/contexts/DocumentSessionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  extractFilesLocally,
  type ExtractionProgress,
} from "@/lib/client/document-extraction";
import { validateSelectedFiles } from "@/lib/analysis/limits";
import type { Id } from "@/convex/_generated/dataModel";

type Step = 1 | 2 | 3;
type ProfileForm = {
  name: string;
  citizenship: string;
  dateOfBirth: string;
  institution: string;
  course: string;
  studyLevel: string;
  householdIncome: string;
  documentFlags: {
    hasTranscript: boolean;
    hasIcCopy: boolean;
    hasIncomeStatement: boolean;
    hasRefereeLetter: boolean;
  };
};

const EMPTY_PROFILE: ProfileForm = {
  name: "",
  citizenship: "Malaysian",
  dateOfBirth: "",
  institution: "",
  course: "",
  studyLevel: "Undergraduate",
  householdIncome: "",
  documentFlags: {
    hasTranscript: false,
    hasIcCopy: false,
    hasIncomeStatement: false,
    hasRefereeLetter: false,
  },
};

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-siap-ink/80 block">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full border border-siap-gray rounded p-2.5 bg-white text-sm focus:border-siap-ink focus:ring-1 focus:ring-siap-ink outline-none";

function NewAnalysisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { setDocuments, clearDocuments } = useDocumentSession();
  const savedProfile = useQuery(api.profiles.get);
  const upsertProfile = useMutation(api.profiles.upsert);
  const createApplication = useMutation(api.applications.create);
  const retryApplication = useMutation(api.applications.retry);
  const [step, setStep] = useState<Step>(1);
  const [applicationPack, setApplicationPack] = useState<File | null>(null);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedProfile = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const resumeParam = searchParams.get("resume");
  const resumeInvalid = Boolean(
    resumeParam && !/^[A-Za-z0-9_-]{20,64}$/.test(resumeParam),
  );
  const resumeId =
    resumeParam && !resumeInvalid ? (resumeParam as Id<"applications">) : null;
  const resumeProgress = useQuery(
    api.applications.getProgress,
    resumeId ? { id: resumeId } : "skip",
  );

  useEffect(() => {
    if (!resumeId || resumeProgress === undefined) return;
    if (resumeProgress?.application.state === "complete") {
      router.replace(`/app/reports/${resumeId}`);
    }
  }, [resumeId, resumeProgress, router]);

  useEffect(() => {
    if (!savedProfile || loadedProfile.current) return;
    loadedProfile.current = true;
    setProfile({
      name: savedProfile.name,
      citizenship: savedProfile.citizenship,
      dateOfBirth: savedProfile.dateOfBirth,
      institution: savedProfile.institution,
      course: savedProfile.course,
      studyLevel: savedProfile.studyLevel,
      householdIncome: String(savedProfile.householdIncome),
      documentFlags: savedProfile.documentFlags,
    });
  }, [savedProfile]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const validProfile =
    profile.name.trim() &&
    profile.citizenship.trim() &&
    profile.dateOfBirth &&
    profile.institution.trim() &&
    profile.course.trim() &&
    profile.studyLevel &&
    profile.householdIncome !== "" &&
    Number(profile.householdIncome) >= 0;
  const resumeError = resumeInvalid
    ? t("Invalid resume link.", "Pautan sambung semula tidak sah.")
    : resumeId && resumeProgress === null
      ? t(
          "The interrupted application was not found.",
          "Permohonan yang terganggu tidak ditemui.",
        )
      : null;

  const loadSample = async () => {
    if (!resumeInvalid) setError(null);
    try {
      const response = await fetch(
        "/sample/Siap%20Demo%20Scholarship%20Pack%202026.pdf",
      );
      if (!response.ok) throw new Error("Sample unavailable");
      const blob = await response.blob();
      setApplicationPack(
        new File([blob], "Siap Demo Scholarship Pack 2026.pdf", {
          type: "application/pdf",
        }),
      );
    } catch {
      setError(
        t(
          "The sample PDF could not be loaded.",
          "PDF sampel tidak dapat dimuatkan.",
        ),
      );
    }
  };

  const addSupportingFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...supportingFiles, ...Array.from(files)];
    try {
      if (applicationPack) validateSelectedFiles(applicationPack, next);
      setSupportingFiles(next);
      if (!resumeInvalid) setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid file");
    }
  };

  const submit = async () => {
    if (!applicationPack || !validProfile || resumeInvalid) return;
    setBusy(true);
    setError(null);
    clearDocuments();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      validateSelectedFiles(applicationPack, supportingFiles);
      await upsertProfile({
        name: profile.name.trim(),
        citizenship: profile.citizenship.trim(),
        dateOfBirth: profile.dateOfBirth,
        institution: profile.institution.trim(),
        course: profile.course.trim(),
        studyLevel: profile.studyLevel,
        householdIncome: Number(profile.householdIncome),
        documentFlags: profile.documentFlags,
      });
      const extracted = await extractFilesLocally(
        applicationPack,
        supportingFiles,
        setProgress,
        controller.signal,
      );
      let id: Id<"applications">;
      if (resumeId) {
        if (resumeProgress === undefined) {
          throw new Error("The interrupted application is still loading");
        }
        if (resumeProgress === null) {
          throw new Error("The interrupted application was not found");
        }
        await retryApplication({
          id: resumeId,
          sourceFileName: applicationPack.name,
        });
        id = resumeId;
      } else {
        id = await createApplication({
          sourceFileName: applicationPack.name,
        });
      }
      setDocuments(extracted);
      router.push(`/app/analysing/${id}`);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(
          caught instanceof Error
            ? caught.message
            : t("Analysis setup failed.", "Persediaan analisis gagal."),
        );
      }
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-serif font-medium">
          {t("New analysis", "Analisis baru")}
        </h1>
        <p className="text-siap-ink/70 mt-2">
          {t(
            "Select an application pack and optional evidence. Extraction and OCR happen on this device.",
            "Pilih pek permohonan dan bukti pilihan. Pengekstrakan dan OCR berlaku pada peranti ini.",
          )}
        </p>
      </header>

      <div className="flex items-center justify-between mb-10">
        {[
          t("Application pack", "Pek permohonan"),
          t("Profile", "Profil"),
          t("Review", "Semakan"),
        ].map((label, index) => {
          const number = (index + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`w-8 h-8 rounded-full grid place-items-center text-sm font-medium ${step >= number ? "bg-siap-ink text-white" : "bg-siap-gray/30 text-siap-ink/50"}`}
              >
                {number}
              </span>
              <span className="hidden sm:block text-sm font-medium">
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-siap-ink rounded-lg shadow-sm p-6 md:p-8">
        {step === 1 ? (
          <section>
            <h2 className="text-xl font-medium">
              {t("Application pack", "Pek permohonan")}
            </h2>
            <p className="text-sm text-siap-ink/65 mt-1 mb-6">
              {t("PDF, maximum 10 MB.", "PDF, maksimum 10 MB.")}
            </p>
            <FileDropzone
              selectedFile={applicationPack}
              onFileSelect={setApplicationPack}
              onClearFile={() => setApplicationPack(null)}
            />
            {!applicationPack ? (
              <button
                onClick={() => void loadSample()}
                className="mt-4 text-sm font-medium text-siap-teal hover:underline"
              >
                {t(
                  "Use fictional Siap demo pack",
                  "Gunakan pek demo Siap fiksyen",
                )}
              </button>
            ) : null}
            <div className="mt-8 pt-6 border-t border-siap-gray/30">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-medium">
                    {t("Supporting evidence", "Bukti sokongan")}
                  </h3>
                  <p className="text-xs text-siap-ink/60">
                    {t(
                      "Up to five PDF, JPG, or PNG files.",
                      "Sehingga lima fail PDF, JPG atau PNG.",
                    )}
                  </p>
                </div>
                <label className="px-3 py-2 border border-siap-ink rounded text-sm font-medium cursor-pointer">
                  {t("Add files", "Tambah fail")}
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="sr-only"
                    onChange={(event) => addSupportingFiles(event.target.files)}
                  />
                </label>
              </div>
              <div className="space-y-2">
                {supportingFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}`}
                    className="flex items-center gap-3 border border-siap-gray/50 rounded p-3"
                  >
                    <FileText className="w-4 h-4 text-siap-teal" />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    <button
                      onClick={() =>
                        setSupportingFiles((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h2 className="text-xl font-medium mb-1">
              {t("Applicant profile", "Profil pemohon")}
            </h2>
            <p className="text-sm text-siap-ink/65 mb-6">
              {t(
                "Stored in Convex until you delete it.",
                "Disimpan dalam Convex sehingga anda memadamkannya.",
              )}
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              <FormField label={t("Full name", "Nama penuh")}>
                <input
                  className={inputClass}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </FormField>
              <FormField label={t("Citizenship", "Kewarganegaraan")}>
                <input
                  className={inputClass}
                  value={profile.citizenship}
                  onChange={(e) =>
                    setProfile({ ...profile, citizenship: e.target.value })
                  }
                />
              </FormField>
              <FormField label={t("Date of birth", "Tarikh lahir")}>
                <input
                  type="date"
                  className={inputClass}
                  value={profile.dateOfBirth}
                  onChange={(e) =>
                    setProfile({ ...profile, dateOfBirth: e.target.value })
                  }
                />
              </FormField>
              <FormField label={t("Institution", "Institusi")}>
                <input
                  className={inputClass}
                  value={profile.institution}
                  onChange={(e) =>
                    setProfile({ ...profile, institution: e.target.value })
                  }
                />
              </FormField>
              <FormField label={t("Course", "Kursus")}>
                <input
                  className={inputClass}
                  value={profile.course}
                  onChange={(e) =>
                    setProfile({ ...profile, course: e.target.value })
                  }
                />
              </FormField>
              <FormField label={t("Study level", "Peringkat pengajian")}>
                <select
                  className={inputClass}
                  value={profile.studyLevel}
                  onChange={(e) =>
                    setProfile({ ...profile, studyLevel: e.target.value })
                  }
                >
                  <option>Foundation</option>
                  <option>Diploma</option>
                  <option>Undergraduate</option>
                  <option>Postgraduate</option>
                </select>
              </FormField>
              <FormField
                label={t("Household income (RM)", "Pendapatan isi rumah (RM)")}
              >
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={profile.householdIncome}
                  onChange={(e) =>
                    setProfile({ ...profile, householdIncome: e.target.value })
                  }
                />
              </FormField>
            </div>
            <h3 className="text-sm font-medium mt-7 mb-3">
              {t("Documents already available", "Dokumen yang sudah tersedia")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                [
                  "hasTranscript",
                  t("Academic transcript", "Transkrip akademik"),
                ],
                ["hasIcCopy", t("IC copy", "Salinan kad pengenalan")],
                [
                  "hasIncomeStatement",
                  t("Income statement", "Penyata pendapatan"),
                ],
                ["hasRefereeLetter", t("Referee letter", "Surat rujukan")],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      profile.documentFlags[
                        key as keyof ProfileForm["documentFlags"]
                      ]
                    }
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        documentFlags: {
                          ...profile.documentFlags,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h2 className="text-xl font-medium mb-6">
              {t("Privacy review", "Semakan privasi")}
            </h2>
            <div className="space-y-4 text-sm">
              <div className="flex gap-3 p-4 bg-siap-teal/5 border border-siap-teal/20 rounded">
                <Shield className="w-5 h-5 text-siap-teal shrink-0" />
                <p>
                  {t(
                    "Raw files never leave this device. Extracted text passes transiently through Siap to Chutes TEE inference and is not retained.",
                    "Fail mentah tidak pernah meninggalkan peranti ini. Teks yang diekstrak dihantar sementara melalui Siap ke inferens TEE Chutes dan tidak disimpan.",
                  )}
                </p>
              </div>
              <dl className="grid grid-cols-[9rem_1fr] gap-y-3">
                <dt className="text-siap-ink/60">
                  {t("Application", "Permohonan")}
                </dt>
                <dd className="font-medium">{applicationPack?.name}</dd>
                <dt className="text-siap-ink/60">
                  {t("Supporting files", "Fail sokongan")}
                </dt>
                <dd className="font-medium">{supportingFiles.length}</dd>
                <dt className="text-siap-ink/60">
                  {t("Applicant", "Pemohon")}
                </dt>
                <dd className="font-medium">{profile.name}</dd>
              </dl>
            </div>
          </section>
        ) : null}

        {resumeError || error ? (
          <p
            role="alert"
            className="mt-6 p-3 bg-siap-red/10 text-siap-red text-sm rounded"
          >
            {resumeError ?? error}
          </p>
        ) : null}
        {busy ? (
          <div className="mt-6 p-4 bg-siap-gray/10 rounded flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-siap-teal" />
            <p className="text-sm flex-1">
              {progress
                ? `${progress.phase === "ocr" ? "Local OCR" : "Local extraction"}: ${progress.fileName}, ${progress.currentPage}/${progress.totalPages}`
                : t(
                    "Preparing local extraction...",
                    "Menyediakan pengekstrakan tempatan...",
                  )}
            </p>
            <button
              onClick={() => abortRef.current?.abort()}
              className="text-sm underline"
            >
              {t("Cancel", "Batal")}
            </button>
          </div>
        ) : null}

        <footer className="mt-8 pt-6 border-t border-siap-gray/30 flex justify-between">
          <button
            onClick={() => setStep((value) => Math.max(1, value - 1) as Step)}
            disabled={step === 1 || busy}
            className="inline-flex items-center gap-2 px-4 py-2 disabled:opacity-30"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("Back", "Kembali")}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((value) => Math.min(3, value + 1) as Step)}
              disabled={
                (step === 1 && !applicationPack) ||
                (step === 2 && !validProfile)
              }
              className="inline-flex items-center gap-2 bg-siap-ink text-white px-5 py-2.5 rounded font-medium disabled:opacity-40"
            >
              {t("Continue", "Teruskan")}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={
                busy ||
                resumeInvalid ||
                (resumeId !== null &&
                  (resumeProgress === undefined || resumeProgress === null))
              }
              className="inline-flex items-center gap-2 bg-siap-ink text-white px-5 py-2.5 rounded font-medium disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {t("Extract and analyse", "Ekstrak dan analisis")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export default function NewAnalysis() {
  return (
    <Suspense
      fallback={
        <div className="py-20 grid place-items-center">
          <Loader2 className="w-7 h-7 animate-spin text-siap-teal" />
        </div>
      }
    >
      <NewAnalysisForm />
    </Suspense>
  );
}
