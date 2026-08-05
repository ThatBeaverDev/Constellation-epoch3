import { Environment } from "../../util/types/worker";
import { formatTable } from "../../util/lib/table";
import { readableTime } from "../../util/lib/time";
import { PackagesJson } from "./pkg/types";
import { formatBytes } from "@/lib/diskSize";
import { user } from "@/lib/users";
import { GUI_SOCKET_PATH } from "./gui/constants";

function normalisedPlatform() {
	const platform = navigator.platform;

	switch (platform) {
		case "Android":
			return "Android";

		case "iPhone":
		case "iPhone Simulator":
		case "iPod":
		case "iPod Simulator":
			return "iOS";

		case "iPad":
		case "iPad Simulator":
			return "iPadOS";

		case "Macintosh":
		case "MacIntel":
		case "MacPPC":
		case "Mac68K":
			return "macOS";

		case "BlackBerry":
			return "Blackberry";

		case "FreeBSD":
		case "FreeBSD i386":
		case "FreeBSD amd64":
		case "FreeBSD*":
			return "FreeBSD";

		case "Linux":
		case "Linux*":
			return "Linux";

		case "OS/2":
		case "Pocket PC":
		case "Windows":
		case "Win16":
		case "Win32":
		case "WinCE":
		case "Win64":
			return "Windows";

		case "New Nintendo 3DS":
			return "Nintendo 3DS";
		case "Nintendo DSi":
		case "Nintendo 3DS":
		case "Nintendo Wii":
		case "Nintendo WiiU":
			return platform;

		case "OpenBSD amd64":
			return "OpenBSD";

		case "SunOS":
		case "SunOS i86pc":
			return "Solaris";

		case "masking-agent":
			return "Unknown (Masked)";
	}

	if (platform.startsWith("Android ")) return "Android";
	if (platform.startsWith("FreeBSD ")) return "FreeBSD";
	if (platform.startsWith("Linux ")) return "Linux";
	if (platform.startsWith("OpenBSD ")) return "OpenBSD";

	return "Unknown";
}

export default async function* getInfo(env: Environment) {
	const self = await env.self();

	const selfUser = await user(env, self.UID);
	const username = selfUser?.displayName ?? selfUser?.name ?? `${self.UID}`;
	const hostname = "Constellation";

	const systemName = "Constellation";
	const systemVersion = await env.systemStats.kernelVersion();

	const uptime = await env.systemStats.uptime();

	const pkgdPackagesJson = await env.fs.readFile<PackagesJson>(
		"/data/pkgs/packages.json",
		"json"
	);

	const packages = pkgdPackagesJson
		? Object.keys(pkgdPackagesJson.packages).length
		: 0;

	const shell = (await env.parent())?.name;

	let desktop = "None";
	if (await env.fs.exists(GUI_SOCKET_PATH)) {
		desktop = "constellation-gui";
	}

	const storageUsageBytes = await env.fs.usedSize();
	const storageMaxBytes = await env.fs.maxSize();

	const usedStorage = formatBytes(storageUsageBytes);
	const maxStorage = formatBytes(storageMaxBytes);

	const storagePercentage = storageUsageBytes / storageMaxBytes;
	const scaledStoragePercentage = storagePercentage * 100;
	const roundedStoragePercentage =
		Math.round(scaledStoragePercentage * 100) / 100;

	const storageInfo = `${usedStorage}/${maxStorage} (${roundedStoragePercentage}%)`;

	const processes = (await env.processes()).length;

	const hostOS = normalisedPlatform();

	const time = new Date().toString();

	const table = formatTable(
		[
			["User", `${username}@${hostname}`],
			["System", `${systemName} v${systemVersion}`],
			["Kernel", "unknown"],
			["Uptime", readableTime(uptime)],
			["Packages", `${packages}`],
			["Shell", shell || "No Shell Detected"],
			["Desktop", desktop],
			["Storage", storageInfo],
			["Processes", `${processes}`],
			["HostOS", hostOS],
			["Time", time]
		],
		undefined,
		"|"
	);

	const tableLines = table.split("\n");
	const constellationLogo = [
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
		"         #######         "
	];

	for (const i in tableLines) {
		env.print([
			{ text: constellationLogo[i], colour: "#dba2fa" },
			{ text: "  " + tableLines[i] }
		]);
	}
}
