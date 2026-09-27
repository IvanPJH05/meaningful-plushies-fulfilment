import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.meaningfulplushies.fulfilment",
  appName: "Meaningful Fulfilment",
  webDir: "mobile/dist",
  android: { backgroundColor: "#f4f7fb", loggingBehavior: "debug" },
};

export default config;
