/**
 * Remotion config for the Manjhi 3D short.
 *
 * NOTE (Remotion 4.0.542): `Config.setChromiumOpenGl` does NOT exist in this
 * version — pass `--gl swiftshader` on the render/stills command line instead.
 * Browser executable: `npx remotion browser install chromium` (once), or
 * `--browser-executable ~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`.
 */
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
