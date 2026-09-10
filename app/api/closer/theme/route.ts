import { NextResponse } from "next/server";

import { closerTheme } from "@/src/modules/closer/service";

const defaults = { heading: "Your shared space", accent: "#d76b83", background: "#e7eedf" };

function themeValue(value: unknown, fallback: string, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value) ? value : fallback;
}

export async function GET() {
  try {
    const saved = await closerTheme();
    return NextResponse.json({
      theme: {
        heading: themeValue(saved.heading, defaults.heading, /^.{1,80}$/),
        accent: themeValue(saved.accent, defaults.accent, /^#[0-9a-fA-F]{6}$/),
        background: themeValue(saved.background, defaults.background, /^#[0-9a-fA-F]{6}$/),
      },
    });
  } catch {
    return NextResponse.json({ theme: defaults });
  }
}
