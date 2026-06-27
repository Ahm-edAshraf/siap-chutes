"use client";

import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PrivacyPage() {
  const { t } = useLanguage();
  const sections = [
    [
      t("1. Local files and extraction", "1. Fail dan pengekstrakan tempatan"),
      t(
        "Raw PDF and image files remain on your device. PDF text extraction and English/Bahasa Malaysia OCR run in browser memory. Files, canvases, OCR workers, and extracted text are released after completion or cancellation and are not placed in browser storage.",
        "Fail PDF dan imej mentah kekal pada peranti anda. Pengekstrakan teks PDF dan OCR Bahasa Inggeris/Bahasa Malaysia berjalan dalam memori pelayar. Fail, kanvas, pekerja OCR dan teks yang diekstrak dilepaskan selepas selesai atau dibatalkan dan tidak dimasukkan ke storan pelayar.",
      ),
    ],
    [
      t("2. Transient inference", "2. Inferens sementara"),
      t(
        "Extracted text passes transiently over HTTPS through Siap's server to Chutes inference. Siap verifies that the selected model reports confidential_compute=true before sending content. This implementation is protected by confidential compute, but it does not claim browser-to-enclave end-to-end encryption.",
        "Teks yang diekstrak dihantar sementara melalui HTTPS menerusi pelayan Siap ke inferens Chutes. Siap mengesahkan model yang dipilih melaporkan confidential_compute=true sebelum menghantar kandungan. Pelaksanaan ini dilindungi pengkomputeran sulit, tetapi tidak mendakwa penyulitan hujung-ke-hujung dari pelayar ke enklaf.",
      ),
    ],
    [
      t("3. Data retained in Convex", "3. Data yang disimpan dalam Convex"),
      t(
        "Convex stores your profile, structured conclusions, citation excerpts capped at 240 characters, action state, inventory metadata, and content-free model-run metadata until you delete them. Siap does not retain prompts, complete extracted text, raw model responses, raw files, or Chutes tokens.",
        "Convex menyimpan profil anda, kesimpulan berstruktur, petikan rujukan terhad kepada 240 aksara, status tindakan, metadata inventori dan metadata proses model tanpa kandungan sehingga anda memadamkannya. Siap tidak menyimpan prompt, teks penuh yang diekstrak, respons model mentah, fail mentah atau token Chutes.",
      ),
    ],
    [
      t("4. Authentication and billing", "4. Pengesahan dan pengebilan"),
      t(
        "Chutes access and refresh tokens are held only in Secure, HttpOnly cookies. Inference is billed to the signed-in user's Chutes account. You can delete one report or all Siap data and revoke the local session by signing out.",
        "Token akses dan segar semula Chutes hanya disimpan dalam kuki Secure, HttpOnly. Inferens dicaj kepada akaun Chutes pengguna yang log masuk. Anda boleh memadam satu laporan atau semua data Siap dan membatalkan sesi tempatan dengan log keluar.",
      ),
    ],
  ];
  return (
    <div className="min-h-screen bg-siap-paper">
      <main className="max-w-3xl mx-auto py-12 px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-siap-ink/60 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("Back to home", "Kembali ke laman utama")}
        </Link>
        <header className="mb-12">
          <div className="w-12 h-12 bg-siap-teal/10 text-siap-teal rounded grid place-items-center mb-6">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-serif font-medium">
            {t("Privacy", "Privasi")}
          </h1>
          <p className="text-siap-ink/70 mt-3">
            {t(
              "Last updated: 27 June 2026",
              "Kemas kini terakhir: 27 Jun 2026",
            )}
          </p>
        </header>
        <div className="space-y-9 text-siap-ink/80 leading-relaxed">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-xl font-medium text-siap-ink mb-3">
                {title}
              </h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
