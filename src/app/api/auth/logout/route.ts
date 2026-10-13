import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/auth/session";
import { requestOrigin } from "@/lib/safe-redirect";

/** Form POST from the UI; SameSite=Lax cookies keep cross-site posts from signing anyone out. */
export async function POST(request: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL("/login", requestOrigin(request.headers, request.nextUrl.origin)), { status: 303 });
}
