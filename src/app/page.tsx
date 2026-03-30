import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold">Agentic Dealflow</h1>
          <p className="text-gray-500 mt-2">
            Ladda upp ett forfrågningsunderlag for strukturerad kravanalys.
          </p>
        </div>
        <UploadForm />
      </div>
    </main>
  );
}
