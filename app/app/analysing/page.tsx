import Link from "next/link";
import { FileUp } from "lucide-react";

export default function MissingAnalysisSession() {
  return (
    <div className="max-w-xl mx-auto py-16 text-center">
      <FileUp className="w-10 h-10 mx-auto text-siap-teal mb-4" />
      <h1 className="text-2xl font-serif font-medium">
        Select source files again
      </h1>
      <p className="text-siap-ink/65 mt-2 mb-6">
        Siap does not persist raw documents or extracted text, so a reloaded
        analysis needs the original files again.
      </p>
      <Link
        href="/app/new"
        className="inline-flex bg-siap-ink text-white px-5 py-2.5 rounded font-medium"
      >
        New analysis
      </Link>
    </div>
  );
}
