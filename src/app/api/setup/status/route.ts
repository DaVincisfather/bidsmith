import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { countAppUsers } from "@/lib/access";
import { internalError } from "@/lib/api-helpers";

// Public (see middleware PUBLIC_PATHS): the /setup page calls this BEFORE any
// session exists, to decide whether a fresh install still needs bootstrapping.
export async function GET() {
  try {
    const service = createServiceClient();
    const count = await countAppUsers(service);
    return NextResponse.json({ needsSetup: count === 0 });
  } catch (err) {
    return internalError(err);
  }
}
