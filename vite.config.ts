import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify -- file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      // Every *.test.ts that touches the real Firestore emulator
      // (vehicleInspections/maintenance/bookingBuffer/durablePersistence/
      // whatsappConversation/...) connects to the SAME emulator project, and
      // several of them clear+reseed shared collection names (most notably
      // 'vehicles') in their own beforeEach/afterEach. Vitest's default file
      // parallelism runs test files concurrently in separate workers, which
      // is safe for the mocked-admin suites (each has its own in-memory
      // Firestore double) but NOT for these real-emulator files: one file's
      // blanket collection clear can wipe out a document another file just
      // seeded, mid-test, on a genuinely shared backing store. Discovered
      // while adding tests/whatsappConversation.test.ts (its multi-step
      // conversation flow is slow enough per test to reliably land inside
      // another file's clear/reseed window under parallel execution) -- a
      // pre-existing fragility in the emulator test architecture that had
      // simply never been triggered by a slow-enough test before. Forcing
      // all test files to run sequentially removes the race entirely, at
      // the cost of a slower total suite runtime (still a few minutes, not
      // the handful of seconds parallel execution would take) --
      // correctness over speed for a test suite.
      fileParallelism: false
    },
  };
});
