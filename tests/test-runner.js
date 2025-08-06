#!/usr/bin/env deno run --allow-read --allow-net --allow-run

import { dirname, fromFileUrl, resolve } from "https://deno.land/std@0.200.0/path/mod.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));

const testFiles = [
	"basic.test.js",
	"format-support.test.js",
	"streaming.test.js",
	"performance.test.js",
	"edge-cases.test.js",
	"large-data.test.js",
	"deflate64.test.js",
	"bundle.test.js",
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

console.log("Running CompressionStream/DecompressionStream Polyfill Test Suite");
console.log("=".repeat(60));

for (const testFile of testFiles) {
	console.log(`\nRunning ${testFile}...`);

	try {
		const cmd = new Deno.Command(Deno.execPath(), {
			args: ["run", "--allow-read", "--allow-net", resolve(__dirname, testFile)],
			stdout: "piped",
			stderr: "piped",
		});

		const { code, stdout, stderr } = await cmd.output();
		const output = new TextDecoder().decode(stdout);
		const errorOutput = new TextDecoder().decode(stderr);

		if (code === 0) {
			console.log(output);
			// Count tests from output
			const testMatches = output.match(/✓|❌/g);
			if (testMatches) {
				const passed = (output.match(/✓/g) || []).length;
				const failed = (output.match(/❌/g) || []).length;
				totalTests += passed + failed;
				passedTests += passed;
				failedTests += failed;
			}
		} else {
			console.error(`❌ ${testFile} failed to run:`);
			console.error(errorOutput);
			failedTests++;
			totalTests++;
		}
	} catch (error) {
		console.error(`❌ Error running ${testFile}:`, error.message);
		failedTests++;
		totalTests++;
	}
}

console.log("\n" + "=".repeat(60));
console.log("Test Summary:");
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✓`);
console.log(`Failed: ${failedTests} ❌`);
console.log(`Success Rate: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%`);

if (failedTests > 0) {
	Deno.exit(1);
} else {
	console.log("\nAll tests passed!");
}
