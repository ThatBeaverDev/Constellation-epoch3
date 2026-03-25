import { Environment } from "../lib/worker";
import { formatTable } from "../usrlib/table";

export default async function* getInfo(env: Environment) {
	const username = "root";
	const hostname = "Constellation";

	const systemName = "Constellation";
	const systemVersion = await env.systemStats.kernelVersion();

	const uptime = await env.systemStats.uptime();

	const packages = 0;

	const shell = (await env.parent())?.directory;

	const screen = "Unknown";

	const localStorageCap = "Unlimited";

	const processes = (await env.processes()).length;

	const gpu = "GPU Unsupported";

	const browser = "Unknown";

	const hostOS = "Unknown";

	const time = new Date().toString();

	const table = formatTable(
		[
			["User", `${username}@${hostname}`],
			["System", `${systemName} v${systemVersion}`],
			["Kernel", "unknown"],
			["Uptime", `${uptime}`],
			["Packages", `${packages}`],
			["Shell", shell || "No Shell Detected"],
			["Screen", screen],
			["Storage", localStorageCap],
			["Processes", `${processes}`],
			["GPU", gpu],
			["Browser", browser],
			["HostOS", hostOS],
			["Time", time]
		],
		undefined,
		"|"
	);

	const tableLines = table.split("\n");
	const constellationLogo = [
		"                         ",
		"               ##        ",
		"        ##      ###      ",
		"    ######      #####    ",
		"     #######    ######   ",
		"      ###       ######   ",
		"                #######  ",
		"             #########   ",
		"   ###    ############   ",
		"    #################    ",
		"      #############      ",
		"         #######         ",
		"                         "
	];

	const finalLines = tableLines.map(
		(item, i) => constellationLogo[i] + "  " + item
	);

	const finalText = finalLines.join("\n");

	return finalText;
}
