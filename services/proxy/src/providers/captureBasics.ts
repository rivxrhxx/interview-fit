import type { Locale, Observation } from "../../../../packages/contracts/src/index.ts";
import type { ImageInfo } from "../imageInspect.ts";

const COPY = {
  en: {
    clarityOk: (w: number, h: number) => `The photo resolution (${w}×${h}) is enough for a clear video preview.`,
    clarityLow: (w: number, h: number) => `The photo resolution (${w}×${h}) is lower than a typical HD video frame.`,
    landscape: "The photo is in landscape orientation, like a typical video call frame.",
    other: (orientation: "portrait" | "square") =>
      `The photo is in ${orientation} orientation, while video calls usually show a landscape frame.`,
  },
  ko: {
    clarityOk: (w: number, h: number) => `사진 해상도(${w}×${h})는 화상 미리보기에 충분히 선명해요.`,
    clarityLow: (w: number, h: number) => `사진 해상도(${w}×${h})가 일반적인 HD 화상 화면보다 낮아요.`,
    landscape: "가로 사진이라 일반적인 화상 통화 화면과 비슷해요.",
    other: (orientation: "portrait" | "square") =>
      `${orientation === "portrait" ? "세로" : "정사각형"} 사진이에요. 화상 통화는 보통 가로 화면으로 보여요.`,
  },
};

/** Provider-independent observations derived only from image dimensions. */
export function captureBasics({ width, height }: Pick<ImageInfo, "width" | "height">, locale: Locale = "en"): Observation[] {
  const copy = COPY[locale];
  const megapixels = (width * height) / 1_000_000;
  const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
  return [
    {
      id: "obs_clarity",
      category: "image-clarity",
      assessment: megapixels >= 0.9 ? "ok" : "adjustable",
      text: megapixels >= 0.9 ? copy.clarityOk(width, height) : copy.clarityLow(width, height),
    },
    {
      id: "obs_orientation",
      category: "framing",
      assessment: orientation === "landscape" ? "ok" : "adjustable",
      text: orientation === "landscape" ? copy.landscape : copy.other(orientation),
    },
  ];
}
