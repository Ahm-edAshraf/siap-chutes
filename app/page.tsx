import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Shield,
  Upload,
} from "lucide-react";

const steps = [
  {
    icon: Upload,
    title: "1. Select",
    body: "Select a PDF application pack and optional evidence. Text extraction and English/Bahasa Malaysia OCR run locally.",
  },
  {
    icon: Shield,
    title: "2. Verify",
    body: "Four isolated Chutes stages compile rules, map evidence, challenge assumptions, and verify exact citations.",
  },
  {
    icon: FileText,
    title: "3. Act",
    body: "Follow a dependency-aware plan, request missing documents, and track readiness in a persistent report.",
  },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string | string[] }>;
}) {
  const authError = (await searchParams).auth_error;
  return (
    <div className="min-h-screen flex flex-col text-siap-ink">
      <header className="py-6 px-6 md:px-12 flex justify-between items-center border-b border-siap-ink">
        <Link href="/" className="font-serif text-3xl font-semibold">
          Siap
        </Link>
        <nav className="flex gap-4 items-center font-medium">
          <Link
            href="/privacy"
            className="hidden sm:block hover:text-siap-teal"
          >
            Privacy
          </Link>
          <Link
            href="/api/auth/chutes/login?returnTo=/app"
            className="bg-siap-ink text-white px-5 py-2.5 rounded"
          >
            Sign in with Chutes
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        {authError ? (
          <div role="alert" className="max-w-6xl mx-auto mt-6 px-6 md:px-12">
            <p className="border border-siap-red/30 bg-siap-red/10 text-siap-red rounded px-4 py-3 text-sm">
              Sign-in could not be completed. Please try again.
            </p>
          </div>
        ) : null}
        <section className="py-20 px-6 md:px-12 max-w-6xl mx-auto grid md:grid-cols-2 items-center gap-16">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-siap-gray/20 rounded-full border border-siap-gray text-xs font-medium uppercase tracking-wide">
              <Shield className="w-3.5 h-3.5 text-siap-teal" />
              Verified Chutes confidential compute
            </div>
            <h1 className="font-serif text-5xl md:text-7xl font-medium leading-[1.05] tracking-tight mt-5">
              Paperwork,
              <br />
              made executable.
            </h1>
            <p className="text-xl text-siap-ink/70 max-w-xl leading-relaxed mt-6">
              Siap turns an application pack into evidence-linked eligibility
              checks and an ordered action plan—without retaining raw files.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link
                href="/api/auth/chutes/login?returnTo=/app/new"
                className="inline-flex justify-center items-center gap-2 bg-siap-ink text-white px-6 py-3.5 rounded text-lg font-medium"
              >
                Sign in with Chutes <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/sample/Siap%20Demo%20Scholarship%20Pack%202026.pdf"
                className="inline-flex justify-center items-center border border-siap-ink bg-white px-6 py-3.5 rounded text-lg font-medium"
              >
                Fictional sample pack
              </Link>
            </div>
          </div>
          <div className="bg-white border border-siap-ink rounded-lg shadow-xl p-7">
            <div className="flex justify-between items-start border-b border-siap-gray pb-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-siap-ink/55">
                  Readiness route
                </p>
                <h2 className="font-serif text-2xl mt-1">
                  Evidence before confidence
                </h2>
              </div>
              <span className="font-serif text-4xl text-siap-teal">68%</span>
            </div>
            <div className="mt-6 space-y-5">
              {[
                "Citizenship confirmed from cited evidence",
                "Certified transcript still required",
                "Independent review needs one manual check",
              ].map((text, index) => (
                <div key={text} className="flex gap-3 items-start">
                  {index === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-siap-green shrink-0" />
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-full border-2 shrink-0 ${index === 1 ? "border-siap-red" : "border-siap-amber"}`}
                    />
                  )}
                  <p className="text-sm">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="border-y border-siap-ink bg-siap-ink text-siap-paper py-16 px-6 md:px-12">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10">
            {steps.map((step) => (
              <article key={step.title}>
                <step.icon className="w-7 h-7 text-siap-green mb-5" />
                <h2 className="text-xl font-medium">{step.title}</h2>
                <p className="text-siap-paper/70 leading-relaxed mt-3">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="py-16 px-6 md:px-12 max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="font-serif text-2xl">User-funded inference</h2>
            <p className="mt-3 text-siap-ink/75 leading-relaxed">
              Sign in with Chutes means inference is billed directly to your
              account. Siap never receives or stores your API key.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Precise privacy claims</h2>
            <p className="mt-3 text-siap-ink/75 leading-relaxed">
              Files remain on-device. Extracted text travels transiently over
              HTTPS to verified TEE models; this is confidential compute, not a
              claim of browser-to-enclave E2E encryption.
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t border-siap-ink py-8 px-6 md:px-12 flex justify-between text-sm text-siap-ink/60">
        <span>© 2026 Siap</span>
        <div className="flex gap-5">
          <Link href="/privacy">Privacy</Link>
          <a href="https://chutes.ai" target="_blank" rel="noreferrer">
            Chutes
          </a>
        </div>
      </footer>
    </div>
  );
}
