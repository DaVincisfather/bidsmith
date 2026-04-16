import { UploadForm } from "@/components/upload-form";
import { PipelineRail } from "@/components/pipeline/PipelineRail";

export default function Home() {
  return (
    <main className="min-h-screen bg-white grid grid-cols-[1fr_260px]">
      <div>
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="mb-12">
            <h1 className="text-3xl font-bold">Analysera förfrågningsunderlag</h1>
            <p className="text-gray-500 mt-2">
              Ladda upp ett förfrågningsunderlag för strukturerad kravanalys.
            </p>
          </div>
          <UploadForm />
        </div>
      </div>
      <PipelineRail />
    </main>
  );
}
