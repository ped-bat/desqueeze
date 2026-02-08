import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.js"],
		// Integration & E2E suites write to the same fixtures/desqueezed/ output
		// directory, so test files must run sequentially to avoid race conditions.
		fileParallelism: false,
	},
});
