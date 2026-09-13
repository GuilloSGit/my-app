import { describe, it, expect, vi } from "vitest";
import { dispatchZoomApplyWorkflow } from "@/supabase/functions/_shared/github/dispatch-workflow";

describe("dispatchZoomApplyWorkflow", () => {
  it("llama al endpoint de dispatch de GitHub con el token y el ref correctos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await dispatchZoomApplyWorkflow({ githubPat: "pat123" }, fetchMock);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/GuilloSGit/my-app/actions/workflows/zoom-apply-browser.yml/dispatches",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer pat123");
    expect(init.headers.Accept).toBe("application/vnd.github+json");
    expect(JSON.parse(init.body)).toEqual({ ref: "master" });
  });

  it("devuelve ok:false con el cuerpo de error cuando GitHub responde con error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Bad credentials", { status: 401 }),
    );

    const result = await dispatchZoomApplyWorkflow({ githubPat: "bad" }, fetchMock);

    expect(result).toEqual({ ok: false, error: "Bad credentials" });
  });
});
