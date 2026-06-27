"use client";

import React from "react";
import { FileSearch } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-siap-gray rounded bg-siap-gray/5">
      <div className="w-12 h-12 bg-white rounded flex items-center justify-center border border-siap-gray shadow-sm mb-4">
        <FileSearch className="w-6 h-6 text-siap-ink/60" />
      </div>
      <h3 className="font-medium text-lg mb-1">{title}</h3>
      <p className="text-siap-ink/60 max-w-sm mb-6 text-sm">{description}</p>

      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center justify-center px-4 py-2 bg-siap-ink text-white font-medium rounded text-sm hover:bg-siap-ink/90 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
