import type { Locale, Observation } from "../../../../packages/contracts/src/index.ts";
import type { ImageInfo } from "../imageInspect.ts";

const COPY = {
  en: {
    clarityOk: (w: number, h: number) => `The photo resolution (${w}×${h}) is enough for a clear video preview.`,
    clarityLow: (w: number, h: number) => `The photo resolution (${w}×${h}) is low for a clear preview.`,
    landscape: "The photo is in landscape orientation, like a typical video call frame.",
    other: (orientation: "portrait" | "square") =>
      `The photo is in ${orientation} orientation, while video calls usually show a landscape frame.`,
  },
  ko: {
    clarityOk: (w: number, h: number) => `사진 해상도(${w}×${h})는 화상 미리보기에 충분히 선명해요.`,
    clarityLow: (w: number, h: number) => `사진 해상도(${w}×${h})가 선명한 미리보기에는 낮은 편이에요.`,
    landscape: "가로 사진이라 일반적인 화상 통화 화면과 비슷해요.",
    other: (orientation: "portrait" | "square") =>
      `${orientation === "portrait" ? "세로" : "정사각형"} 사진이에요. 화상 통화는 보통 가로 화면으로 보여요.`,
  },
};

/**
 * The desktop scales every photo to at most 1024 px on the long side (R3.3), so
 * clarity is judged against that cap: a photo that filled it (and keeps a usable
 * short side) is sharp enough; a smaller source is not.
 */
const MIN_LONG_SIDE = 960;
const MIN_SHORT_SIDE = 480;

/** Provider-independent observations derived only from image dimensions. */
export function captureBasics({ width, height }: Pick<ImageInfo, "width" | "height">, locale: Locale = "en"): Observation[] {
  const copy = COPY[locale];
  const sharp = Math.max(width, height) >= MIN_LONG_SIDE && Math.min(width, height) >= MIN_SHORT_SIDE;
  const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
  return [
    {
      id: "obs_clarity",
      category: "image-clarity",
      assessment: sharp ? "ok" : "adjustable",
      text: sharp ? copy.clarityOk(width, height) : copy.clarityLow(width, height),
    },
    {
      id: "obs_orientation",
      category: "framing",
      assessment: orientation === "landscape" ? "ok" : "adjustable",
      text: orientation === "landscape" ? copy.landscape : copy.other(orientation),
    },
  ];
}
