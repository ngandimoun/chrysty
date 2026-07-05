import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Serwist generated service worker
    "public/sw.js",
    // Perception model/runtime assets copied for browser tests
    "public/models/**",
    // LiveKit Agents UI shadcn components (vendor)
    "src/hooks/use-agent-audio-visualizer-aura.ts",
    "src/components/agent-audio-visualizer-aura.tsx",
    "src/components/react-shader-toy.tsx",
    "src/components/start-audio-button.tsx",
  ]),
]);

export default eslintConfig;
