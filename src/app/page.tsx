import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="min-h-full bg-paper">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-display font-normal">Analysera förfrågningsunderlag</h1>
          <p className="text-ink-mute mt-2">
            Ladda upp ett förfrågningsunderlag för strukturerad kravanalys.
          </p>
        </div>
        <UploadForm />
      </div>
    </main>
  );
}
