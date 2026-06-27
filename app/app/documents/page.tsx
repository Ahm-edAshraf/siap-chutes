"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Clock, Loader2, Plus, Search, Shield, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ToastProvider";
import { useLanguage } from "@/contexts/LanguageContext";

const statusLabels = {
  ready: ["Ready", "Sedia"],
  expiring: ["Expiring", "Akan tamat tempoh"],
  missing: ["Missing", "Hilang"],
  needs_certification: ["Needs certification", "Perlu pengesahan"],
} as const;

export default function DocumentsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const documents = useQuery(api.inventory.list);
  const upsert = useMutation(api.inventory.upsert);
  const remove = useMutation(api.inventory.remove);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<keyof typeof statusLabels>("ready");
  if (documents === undefined) {
    return (
      <div className="py-20 grid place-items-center">
        <Loader2 className="w-7 h-7 animate-spin text-siap-teal" />
      </div>
    );
  }
  const visible = documents.filter((document) =>
    document.name.toLowerCase().includes(search.toLowerCase()),
  );
  const add = async () => {
    if (!name.trim()) return;
    try {
      await upsert({
        name: name.trim(),
        status,
        lastUpdatedAt: status === "missing" ? undefined : Date.now(),
      });
      setName("");
    } catch {
      toast(
        t("Could not save document", "Dokumen tidak dapat disimpan"),
        "error",
      );
    }
  };
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <header className="mb-8">
        <h1 className="text-3xl font-serif font-medium">
          {t("Document inventory", "Inventori dokumen")}
        </h1>
        <p className="text-siap-ink/70 mt-2">
          {t(
            "Readiness metadata only; Siap never stores the file itself.",
            "Metadata kesediaan sahaja; Siap tidak pernah menyimpan fail itu sendiri.",
          )}
        </p>
      </header>
      <div className="bg-siap-teal/5 border border-siap-teal/20 rounded p-4 mb-8 flex gap-3">
        <Shield className="w-5 h-5 text-siap-teal shrink-0" />
        <p className="text-sm">
          {t(
            "Names and statuses are stored in Convex. Raw files remain on your device.",
            "Nama dan status disimpan dalam Convex. Fail mentah kekal pada peranti anda.",
          )}
        </p>
      </div>
      <div className="grid sm:grid-cols-[1fr_12rem_auto] gap-3 mb-6">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Document name", "Nama dokumen")}
          className="border border-siap-gray rounded px-3 py-2 bg-white text-sm"
        />
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as keyof typeof statusLabels)
          }
          className="border border-siap-gray rounded px-3 py-2 bg-white text-sm"
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label[0], label[1])}
            </option>
          ))}
        </select>
        <button
          onClick={() => void add()}
          className="inline-flex items-center justify-center gap-2 bg-siap-ink text-white px-4 py-2 rounded text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t("Add", "Tambah")}
        </button>
      </div>
      <label className="relative block max-w-xs mb-5">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-siap-ink/45" />
        <span className="sr-only">{t("Search", "Cari")}</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("Search inventory...", "Cari inventori...")}
          className="w-full pl-10 pr-3 py-2 border border-siap-gray rounded bg-white text-sm"
        />
      </label>
      <div className="bg-white border border-siap-ink rounded overflow-hidden divide-y divide-siap-gray/30">
        {visible.map((document) => (
          <div
            key={document._id}
            className="grid grid-cols-[1fr_auto_auto] gap-4 items-center p-4"
          >
            <div>
              <p className="font-medium">{document.name}</p>
              {document.lastUpdatedAt ? (
                <p className="text-xs text-siap-ink/55 mt-1 flex gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(document.lastUpdatedAt).toLocaleDateString()}
                </p>
              ) : null}
            </div>
            <StatusBadge
              label={t(
                statusLabels[document.status][0],
                statusLabels[document.status][1],
              )}
              variant={
                document.status === "ready"
                  ? "success"
                  : document.status === "missing"
                    ? "error"
                    : "warning"
              }
            />
            <button
              onClick={() => {
                void remove({
                  id: document._id as Id<"inventoryDocuments">,
                }).catch(() =>
                  toast(
                    t(
                      "Could not delete document",
                      "Dokumen tidak dapat dipadam",
                    ),
                    "error",
                  ),
                );
              }}
              aria-label={`Delete ${document.name}`}
              className="text-siap-red/70 hover:text-siap-red"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {!visible.length ? (
          <p className="p-8 text-center text-sm text-siap-ink/60">
            {t("No inventory records.", "Tiada rekod inventori.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
