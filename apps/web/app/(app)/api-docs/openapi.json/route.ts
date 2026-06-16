import { NextResponse } from "next/server";
import { openApiSpec } from "./spec";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(openApiSpec);
}
