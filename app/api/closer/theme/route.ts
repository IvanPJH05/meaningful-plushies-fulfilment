import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";

const defaults = { heading: "Your shared space", accent: "#d76b83", background: "#e7eedf" };

function themeValue(value: unknown, fallback: string, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value) ? value : fallback;
}

export async function GET() {
  try {
    const settings = await prisma.closerAppSettings.findUnique({ where: { id: "default" } });
    const saved = settings?.theme && typeof settings.theme === "object" ? settings.theme as Record<string, unknown> : {};
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
