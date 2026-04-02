"use client";

import { useRouter } from "next/navigation";
import { ConsultantUpload } from "./consultant-upload";

export function ConsultantUploadWrapper() {
  const router = useRouter();

  return <ConsultantUpload onComplete={() => router.refresh()} />;
}
