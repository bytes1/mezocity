import { NextRequest, NextResponse } from "next/server";
import {
  getCycleByUidFromNeon,
  getInngestRunTelemetry,
  getLatestCyclesFromNeon,
} from "@/lib/neon-db";

export const dynamic = "force-dynamic";

async function buildLiveSnapshot(cycleUid: string) {
  const [neonStatus, telemetry, trackedCycle] = await Promise.all([
    getLatestCyclesFromNeon(8),
    getInngestRunTelemetry(),
    cycleUid ? getCycleByUidFromNeon(cycleUid) : Promise.resolve(null),
  ]);

  return {
    ok: true,
    neonConnected: neonStatus.neonConnected,
    cycle: trackedCycle || neonStatus.latestCycle,
    latestCycle: neonStatus.latestCycle,
    history: neonStatus.history,
    telemetry,
  };
}

export async function GET(req: NextRequest) {
  try {
    const cycleUid = req.nextUrl.searchParams.get("cycleUid") || "";
    const streamMode = req.nextUrl.searchParams.get("stream") === "1";

    if (!streamMode) {
      const snapshot = await buildLiveSnapshot(cycleUid);
      return NextResponse.json(snapshot);
    }

    // Server-Sent Events (SSE) stream pushing Neon turn-by-turn cycle updates in real time
    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        let lastSignature = "";
        const startedAt = Date.now();

        const sendEvent = (payload: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: cycle\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        };

        const tick = async () => {
          while (!closed) {
            try {
              const snapshot = await buildLiveSnapshot(cycleUid);
              const cyc = snapshot.cycle;
              const sig = cyc
                ? `${cyc.cycleUid}|${cyc.status}|${cyc.messages.length}|${cyc.updatedAt}|${cyc.txHash}`
                : `empty|${snapshot.neonConnected}`;

              if (sig !== lastSignature) {
                lastSignature = sig;
                sendEvent(snapshot);
              }

              const isTrackedFinished =
                cyc &&
                (!cycleUid || cyc.cycleUid === cycleUid) &&
                (cyc.status === "COMPLETED" || cyc.status === "FAILED");

              if (isTrackedFinished || Date.now() - startedAt > 125000) {
                closed = true;
                controller.close();
                return;
              }
            } catch (err) {
              if (!closed) {
                controller.enqueue(
                  encoder.encode(
                    `event: error\ndata: ${JSON.stringify({
                      error: err instanceof Error ? err.message : String(err),
                    })}\n\n`
                  )
                );
              }
            }

            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        };

        req.signal.addEventListener("abort", () => {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        });

        tick();
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
