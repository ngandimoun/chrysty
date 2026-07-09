export interface Size {
  width: number;
  height: number;
}

export interface ObjectCoverLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
}

export function computeObjectCoverLayout(container: Size, image: Size): ObjectCoverLayout {
  const scale = Math.max(container.width / image.width, container.height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;

  return {
    scale,
    offsetX: (container.width - renderedWidth) / 2,
    offsetY: (container.height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  };
}

export function mapPreviewPointToImage(
  previewX: number,
  previewY: number,
  preview: Size,
  image: Size,
  digitalScale = 1,
): { x: number; y: number } {
  const px = previewX * preview.width;
  const py = previewY * preview.height;
  const centerX = preview.width / 2;
  const centerY = preview.height / 2;

  const unscaledX =
    digitalScale === 1 ? px : (px - centerX) / digitalScale + centerX;
  const unscaledY =
    digitalScale === 1 ? py : (py - centerY) / digitalScale + centerY;

  const layout = computeObjectCoverLayout(preview, image);

  return {
    x: (unscaledX - layout.offsetX) / layout.renderedWidth,
    y: (unscaledY - layout.offsetY) / layout.renderedHeight,
  };
}

export function drawVideoFrameObjectCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  output: Size,
  digitalScale = 1,
): void {
  const image = { width: video.videoWidth, height: video.videoHeight };
  if (image.width <= 0 || image.height <= 0 || output.width <= 0 || output.height <= 0) {
    return;
  }

  if (digitalScale >= 1) {
    const layout = computeObjectCoverLayout(output, image);
    const sourceWidth = output.width / layout.scale;
    const sourceHeight = output.height / layout.scale;
    const sourceX = -layout.offsetX / layout.scale;
    const sourceY = -layout.offsetY / layout.scale;

    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      output.width,
      output.height,
    );
    return;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, output.width, output.height);

  const scaledOutput = {
    width: output.width * digitalScale,
    height: output.height * digitalScale,
  };
  const destX = (output.width - scaledOutput.width) / 2;
  const destY = (output.height - scaledOutput.height) / 2;
  const layout = computeObjectCoverLayout(scaledOutput, image);
  const sourceWidth = scaledOutput.width / layout.scale;
  const sourceHeight = scaledOutput.height / layout.scale;
  const sourceX = -layout.offsetX / layout.scale;
  const sourceY = -layout.offsetY / layout.scale;

  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destX,
    destY,
    scaledOutput.width,
    scaledOutput.height,
  );
}
