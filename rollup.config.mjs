import { globSync } from "glob";
import path from "path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { string } from "rollup-plugin-string";
import webWorkerLoader from "rollup-plugin-web-worker-loader";
import alias from "@rollup/plugin-alias";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const plugins = [
	alias({
		entries: [
			{
				find: /^@\/(.*)/,
				replacement: path.resolve(
					dirname(fileURLToPath(import.meta.url)),
					"build/util/$1"
				)
			}
		]
	}),
	nodeResolve({
		browser: true,
		preferBuiltins: false
	}),
	string({
		include: ["**/*.css"]
	}),
	commonjs(),
	webWorkerLoader({
		targetPlatform: "auto",
		inline: true
	})
];

const programConfigs = globSync("./build/bin/*.js").map((file) => {
	const name = path.basename(file, ".js");

	return {
		input: file,
		context: "self",
		output: {
			file: `./dist/bin/${name}.js`,
			format: "es"
		},
		plugins
	};
});

const packageConfigsSubfolder = globSync("./build/pkgs/packages/*/*.js")
	.map((file) => {
		const name = path.basename(file, ".js");
		const pathParts = path.dirname(file).split(path.sep);
		const packageName = pathParts[pathParts.length - 1];

		if (packageName !== name) {
			return undefined;
		}

		return {
			input: file,
			context: "self",
			output: {
				file: `./dist/pkgs/packages/${packageName}/${name}.js`,
				format: "es"
			},
			plugins
		};
	})
	.filter((item) => item !== undefined);

const packageConfigsDirect = globSync("./build/pkgs/packages/*.js")
	.map((file) => {
		const name = path.basename(file, ".js");

		return {
			input: file,
			context: "self",
			output: {
				file: `./dist/pkgs/packages/${name}.js`,
				format: "es"
			},
			plugins
		};
	})
	.filter((item) => item !== undefined);

const packageConfigs = [...packageConfigsSubfolder, ...packageConfigsDirect];

export default [
	// Kernel bundle
	{
		input: "build/entry/web.js",
		context: "window",
		output: {
			file: "./dist/kernel.js",
			format: "es",
			inlineDynamicImports: true
		},
		plugins
	},
	{
		input: "build/nodeboot.js",
		context: "global",
		output: {
			file: "./dist/kernel.node.js",
			format: "es",
			inlineDynamicImports: true
		},
		plugins
	},

	...programConfigs,
	...packageConfigs
];
