import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  outputFileTracingIncludes: { "/api/**/*": ["./models/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_shared.so", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node", "./node_modules/onnxruntime-node/package.json", "./node_modules/@huggingface/transformers/package.json"] },
  // The protected deployed probe confirmed linux/x64. Keep its native binding
  // and shared libraries together; NFT does not discover dlopen dependencies.
  outputFileTracingExcludes: { "/api/**/*": ["./node_modules/onnxruntime-node/bin/napi-v3/darwin/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/win32/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*cuda*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/*tensorrt*"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
