import { globSync } from "glob";
import path from "path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import css from "rollup-plugin-import-css";

const programConfigs = globSync("./build/bin/*.js").map((file) => {
	const name = path.basename(file, ".js");

	return {
		input: file,
		output: {
			file: `./dist/bin/${name}.js`,
			format: "es"
		},
		plugins: [
			nodeResolve({
				browser: true,
				preferBuiltins: false
			}),
			commonjs()
		]
	};
});

export default [
	// Kernel bundle
	{
		input: "build/index.js",
		output: {
			file: "./dist/kernel.js",
			format: "es",
			inlineDynamicImports: true
		},
		plugins: [
			nodeResolve({
				browser: true,
				preferBuiltins: false
			}),
			commonjs(),
			css()
		]
	},

	...programConfigs
];
