// Task 4.1 — object URLs are revoked when replaced or unmounted (react-ui steering).
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useObjectUrl } from "./useObjectUrl";

describe("useObjectUrl", () => {
  it("creates one URL per blob and revokes the previous URL when the blob changes", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const first = new Blob(["a"]);
    const second = new Blob(["b"]);

    const { result, rerender } = renderHook(({ blob }) => useObjectUrl(blob), { initialProps: { blob: first } });
    expect(result.current).toBe("blob:first");

    rerender({ blob: second });

    expect(revoke).toHaveBeenCalledWith("blob:first");
    expect(result.current).toBe("blob:second");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("revokes the URL on unmount", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:only");
    const revoke = vi.spyOn(URL, "revokeObjectURL");

    const { unmount } = renderHook(() => useObjectUrl(new Blob(["a"])));
    unmount();

    expect(revoke).toHaveBeenCalledWith("blob:only");
  });

  it("returns null and revokes when the blob is cleared", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cleared");
    const revoke = vi.spyOn(URL, "revokeObjectURL");

    const { result, rerender } = renderHook(({ blob }: { blob: Blob | null }) => useObjectUrl(blob), {
      initialProps: { blob: new Blob(["a"]) as Blob | null },
    });
    rerender({ blob: null });

    expect(result.current).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:cleared");
  });
});
