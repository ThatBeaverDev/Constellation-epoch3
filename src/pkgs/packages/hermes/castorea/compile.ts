export function compileCastoreaSourceCode(src: string) {
	const lines = src.split("\n");

	const shebang = lines[0].trim().startsWith("#!");
	const after = `\n\n\n
let SYS_INIT_EXPORT;
let SYS_FRAME_EXPORT;
let SYS_COMPILER_EXPORT;
let SYS_TERMINATE_EXPORT;
try { SYS_INIT_EXPORT = init; } catch {};
try { SYS_FRAME_EXPORT = frame; } catch {};
try { SYS_COMPILER_EXPORT = compile; } catch {};
try { SYS_TERMINATE_EXPORT = terminate; } catch {};

return {
    init: SYS_INIT_EXPORT,
    frame: SYS_FRAME_EXPORT,
    compile: SYS_COMPILER_EXPORT,
    terminate: SYS_TERMINATE_EXPORT
};`;

	if (shebang) {
		return lines.splice(1).join("\n") + after;
	} else {
		return src + after;
	}
}
