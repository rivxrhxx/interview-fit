import type { Observation } from "../../../../packages/contracts/src/index.ts";
import type { ImageInfo } from "../imageInspect.ts";

/** Provider-independent observations derived only from image dimensions. */
export function captureBasics({ width, height }: Pick<ImageInfo, "width" | "height">): Observation[] {
  const megapixels = (width * height) / 1_000_000;
  const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
  return [
    {
      id: "obs_clarity",
      category: "image-clarity",
      assessment: megapixels >= 0.9 ? "ok" : "adjustable",
      text:
        megapixels >= 0.9
          ? `The photo resolution (${width}×${height}) is enough for a clear video preview.`
          : `The photo resolution (${width}×${height}) is lower than a typical HD video frame.`,
    },
    {
      id: "obs_orientation",
      category: "framing",
      assessment: orientation === "landscape" ? "ok" : "adjustable",
      text:
        orientation === "landscape"
          ? "The photo is in landscape orientation, like a typical video call frame."
          : `The photo is in ${orientation} orientation, while video calls usually show a landscape frame.`,
    },
  ];
}
