import { globSync } from "glob";
import path from "path";

const programConfigs = globSync("./build/bin/*.js").map((file) => {
	const name = path.basename(file, ".js");

	return {
		input: file,
		output: {
			file: `./dist/bin/${name}.js`,
			format: "es"
		}
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
		}
	},

	...programConfigs
];
