import { defineConfig } from 'mobilewright'

export default defineConfig({
  platform: 'android',
  timeout: 20_000,
  // Generated scripts are saved under generated-tests/typescript OR
  // generated-tests/javascript depending on which "Generate" button was
  // used (see fileStore.ts's languageDir()). Scoping testDir to just the
  // typescript subfolder meant every JS-generated script was invisible to
  // discovery - "Run Test" on one always failed with "No tests found",
  // silently, since the test file was never in scope to begin with.
  testDir: './generated-tests',
  outputDir: './reports/mobilewright-results',
  reporter: 'list',
  // Generated scripts rely on auto-launch: renderAction() deliberately skips
  // emitting an explicit launch step for app_launch actions, since
  // test.use({ bundleId }) is expected to launch the app on its own (the
  // default). autoAppLaunch was previously set to false here (silently
  // ignored, since it's a top-level MobilewrightConfig option, not a `use`
  // fixture option) - removed rather than "fixed", since making it effective
  // would break every generated script's app launch.
  use: {
    platform: 'android',
  },
})
