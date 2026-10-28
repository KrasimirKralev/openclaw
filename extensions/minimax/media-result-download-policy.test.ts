import type { OpenClawConfig } from "openclaw/plugin-sdk/runtime-config-snapshot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMinimaxMusicGenerationProvider } from "./music-generation-provider.js";
import { buildMinimaxVideoGenerationProvider } from "./video-generation-provider.js";

vi.mock("openclaw/plugin-sdk/provider-auth-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("openclaw/plugin-sdk/provider-auth-runtime")>()),
  resolveApiKeyForProvider: async () => ({ apiKey: "synthetic-minimax-key" }),
}));

afterEach(() => vi.restoreAllMocks());

// A private relay is trusted for the task API; result URLs come from its responses.
const relayBaseUrl = "http://127.0.0.1:9";

function relayConfig(): OpenClawConfig {
  return {
    models: {
      providers: {
        minimax: { baseUrl: relayBaseUrl, models: [], request: { allowPrivateNetwork: true } },
      },
    },
  } as OpenClawConfig;
}

function serveRelay(resultUrl: string, completed: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === resultUrl) {
      const contentType = resultUrl.endsWith(".mp3") ? "audio/mpeg" : "video/mp4";
      return new Response("synthetic-media", { headers: { "content-type": contentType } });
    }
    if (url.includes("/v1/query/video_generation")) {
      return Response.json({ status: "Success", base_resp: { status_code: 0 }, ...completed });
    }
    return Response.json({
      task_id: "synthetic-task",
      base_resp: { status_code: 0 },
      ...completed,
    });
  });
}

function requestedUrls(fetchMock: ReturnType<typeof serveRelay>) {
  return fetchMock.mock.calls.map(([input]) =>
    input instanceof Request ? input.url : String(input),
  );
}

describe("MiniMax result downloads", () => {
  it.each(["http://127.0.0.1:9/video.mp4", "http://10.0.0.1/video.mp4"])(
    "blocks private video result URL %s even when the task relay is trusted",
    async (resultUrl) => {
      const fetchMock = serveRelay(resultUrl, { video_url: resultUrl });

      await expect(
        buildMinimaxVideoGenerationProvider().generateVideo({
          provider: "minimax",
          model: "MiniMax-Hailuo-2.3",
          prompt: "a synthetic lobster",
          cfg: relayConfig(),
        }),
      ).rejects.toMatchObject({ name: "SsrFBlockedError" });
      expect(requestedUrls(fetchMock)).toEqual([
        `${relayBaseUrl}/v1/video_generation`,
        `${relayBaseUrl}/v1/query/video_generation?task_id=synthetic-task`,
      ]);
    },
  );

  it("blocks a private music result URL even when the task relay is trusted", async () => {
    const resultUrl = "http://10.0.0.1/track.mp3";
    const fetchMock = serveRelay(resultUrl, { audio_url: resultUrl });

    await expect(
      buildMinimaxMusicGenerationProvider().generateMusic({
        provider: "minimax",
        model: "music-2.6",
        prompt: "synthetic dance-pop",
        cfg: relayConfig(),
      }),
    ).rejects.toMatchObject({ name: "SsrFBlockedError" });
    expect(requestedUrls(fetchMock)).toEqual([`${relayBaseUrl}/v1/music_generation`]);
  });

  it("blocks a public video result URL that redirects to a private host", async () => {
    const resultUrl = "http://93.184.216.34/video.mp4";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === resultUrl) {
        return new Response(null, { status: 302, headers: { location: `${relayBaseUrl}/x.mp4` } });
      }
      return url.includes("/v1/query/video_generation")
        ? Response.json({ status: "Success", video_url: resultUrl, base_resp: { status_code: 0 } })
        : Response.json({ task_id: "synthetic-task", base_resp: { status_code: 0 } });
    });

    await expect(
      buildMinimaxVideoGenerationProvider().generateVideo({
        provider: "minimax",
        model: "MiniMax-Hailuo-2.3",
        prompt: "a synthetic lobster",
        cfg: relayConfig(),
      }),
    ).rejects.toMatchObject({ name: "SsrFBlockedError" });
    expect(requestedUrls(fetchMock)).not.toContain(`${relayBaseUrl}/x.mp4`);
  });

  it("still downloads a public video result URL", async () => {
    const resultUrl = "http://93.184.216.34/video.mp4";
    serveRelay(resultUrl, { video_url: resultUrl });

    const result = await buildMinimaxVideoGenerationProvider().generateVideo({
      provider: "minimax",
      model: "MiniMax-Hailuo-2.3",
      prompt: "a synthetic lobster",
      cfg: relayConfig(),
    });

    expect(result.videos[0]?.buffer).toEqual(Buffer.from("synthetic-media"));
  });
});
