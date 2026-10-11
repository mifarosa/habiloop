import { NextResponse, type NextRequest } from "next/server";
import { recordCompletion } from "@/lib/complete";
import { createClient } from "@/lib/supabase/server";

// Used by the service worker's "Yaptım" notification action.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { habitId } = await request.json();
  if (typeof habitId !== "string") return NextResponse.json({ error: "habitId required" }, { status: 400 });

  try {
    await recordCompletion(supabase, user.id, habitId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
