import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ALLOWED_SENDERS = ["patient", "dentist"] as const;
type Sender = (typeof ALLOWED_SENDERS)[number];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSender(value: unknown): value is Sender {
  return typeof value === "string" && (ALLOWED_SENDERS as readonly string[]).includes(value);
}

/**
 * CHALLENGE: MESSAGING SYSTEM
 * 
 * Your goal is to build a basic communication channel between the Patient and Dentist.
 * 1. Implement the POST handler to save a new message into a Thread.
 * 2. Implement the GET handler to retrieve message history for a given thread.
 * 3. Focus on data integrity and proper relations.
 */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    if (!isNonEmptyString(threadId)) {
      return NextResponse.json(
        { ok: false, error: "Missing threadId", details: "threadId query param is required." },
        { status: 400 },
      );
    }

    const messages = await prisma.message.findMany({
      where: { threadId: threadId.trim() },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, threadId: threadId.trim(), messages });
  } catch (err) {
    console.error("Messaging API Error (GET):", err);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", details: "Expected JSON object payload." },
        { status: 400 },
      );
    }

    const { threadId, content, sender } = body as {
      threadId?: unknown;
      content?: unknown;
      sender?: unknown;
    };

    if (!isNonEmptyString(threadId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid threadId", details: "threadId must be a non-empty string." },
        { status: 400 },
      );
    }

    if (!isNonEmptyString(content)) {
      return NextResponse.json(
        { ok: false, error: "Invalid content", details: "Message content cannot be empty." },
        { status: 400 },
      );
    }

    if (!isSender(sender)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid sender",
          details: `sender must be one of: ${ALLOWED_SENDERS.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const safeThreadId = threadId.trim();
    const safeContent = content.trim();

    await prisma.thread.upsert({
      where: { id: safeThreadId },
      update: {},
      create: {
        id: safeThreadId,
        patientId: "patient",
      },
    });

    const message = await prisma.message.create({
      data: {
        threadId: safeThreadId,
        content: safeContent,
        sender,
      },
    });

    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (err) {
    console.error("Messaging API Error:", err);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
