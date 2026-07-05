export interface PerceptionModelAsset {
  id: string;
  capability: string;
  url: string;
  version: string;
}

const modelBaseUrl = process.env.NEXT_PUBLIC_PERCEPTION_MODEL_BASE_URL?.replace(/\/$/, '') ?? '';

function modelUrl(path: string): string {
  return modelBaseUrl ? `${modelBaseUrl}/${path}` : `/models/perception/${path}`;
}

export const PERCEPTION_MODEL_ASSETS: PerceptionModelAsset[] = [
  {
    id: 'object-finder-yolo',
    capability: 'object_finder',
    url: modelUrl('yolo/yolo11n.onnx'),
    version: 'v1',
  },
  {
    id: 'text-reader-eng',
    capability: 'text_reader',
    url: modelUrl('tesseract/eng.traineddata'),
    version: 'v1',
  },
  {
    id: 'mediapipe-vision-wasm',
    capability: 'pose_tracking',
    url: modelUrl('mediapipe/wasm'),
    version: 'v1',
  },
];

export function getModelAsset(id: string): PerceptionModelAsset | undefined {
  return PERCEPTION_MODEL_ASSETS.find((asset) => asset.id === id);
}

