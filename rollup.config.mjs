import { globSync } from "glob";
import path from "path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { string } from "rollup-plugin-string";
import babel from "@rollup/plugin-babel";

const plugins = [
	nodeResolve({
		browser: true,
		preferBuiltins: false
	}),
	commonjs(),
	string({
		include: ["**/*"],
		exclude: ["**/*.js"]
	}),
	babel({
		babelHelpers: "bundled",
		presets: [
			[
				"@babel/preset-env",
				{
					targets: {
						safari: "15"
					},
					corejs: 3
				}
			]
		],
		extensions: [".js", ".js"]
	})
];

const programConfigs = globSync("./build/bin/*.js").map((file) => {
	const name = path.basename(file, ".js");

	return {
		input: file,
		context: "window",
		output: {
			file: `./dist/bin/${name}.js`,
			format: "es"
		},
		plugins
	};
});

const packageConfigs = globSync("./build/pkgs/packages/**/*.js").map((file) => {
	const name = path.basename(file, ".js");
	const pathParts = path.dirname(file).split(path.sep);
	const packageName = pathParts[pathParts.length - 1];

	return {
		input: file,
		context: "self",
		output: {
			file: `./dist/pkgs/packages/${packageName}/${name}.js`,
			format: "es"
		},
		plugins
	};
});

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
