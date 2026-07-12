// SVG string → PNG Blob via pure DOM canvas (PORTED from Armoria download.js:39-48;
// D8). Integration module (uses Image/canvas) — full Clean Code, NOT under the
// FR-018 exception. NO network, NO PIXI. Requires a 100%-inline SVG (else the
// canvas taints) with explicit width/height on the root. Fixed size, no DPR.

/**
 * Rasterise a self-contained SVG string to a PNG Blob.
 * @param {string} svg   self-contained SVG markup (all art inline)
 * @param {number} [size=500]  output pixel size (square)
 * @returns {Promise<Blob>}
 */
export async function svgToPngBlob(svg, size = 500) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null")),
      "image/png"
    );
  });
}
