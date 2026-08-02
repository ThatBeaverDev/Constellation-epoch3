import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PACKAGES_JSON = "./src/pkgs/packages.json";
const PACKAGES_DIRECTORY = "src/pkgs/packages/"; // no "./" because used for matching too

// List of staged files
const stagedFiles = execSync("git diff --cached --name-only", {
	encoding: "utf-8"
})
	.split("\n")
	.filter(Boolean);

if (stagedFiles.length === 0) process.exit(0);

// get packages.json
const packagesFile = JSON.parse(fs.readFileSync(PACKAGES_JSON, "utf-8"));
let updated = false;

// get the modified packages without duplicates
const modifiedPackages = new Set();

for (const file of stagedFiles) {
	// Normalize leading slashes if any
	const cleanPath = file.replace(/^\.\//, "");

	if (cleanPath.startsWith(PACKAGES_DIRECTORY)) {
		const relativePath = cleanPath.slice(PACKAGES_DIRECTORY.length);

		// Split path parts
		const parts = relativePath.split("/");

		if (parts.length === 1) {
			// It's a root file directly under packages/ (e.g., "myPackage.js")
			// Strip the extension to get the clean package name
			const pkgName = path.parse(parts[0]).name;
			if (pkgName) modifiedPackages.add(pkgName);
		} else if (parts.length > 1) {
			// It's a folder-based package (e.g., "myPackage/index.js")
			const pkgName = parts[0];
			if (pkgName) modifiedPackages.add(pkgName);
		}
	}
}

// update package published times, throw if new package present
for (const pkgName of modifiedPackages) {
	// Check if package exists either as a directory OR as a file (.js, .ts, etc.)
	const folderPath = `${PACKAGES_DIRECTORY}${pkgName}`;
	const filePathMatches = fs
		.readdirSync(PACKAGES_DIRECTORY, { withFileTypes: true })
		.some(
			(entry) => entry.isFile() && path.parse(entry.name).name === pkgName
		);

	const existsOnDisk = fs.existsSync(folderPath) || filePathMatches;

	// doesn't exist but registered
	if (!existsOnDisk) {
		if (packagesFile.packages[pkgName]) {
			delete packagesFile.packages[pkgName];
			updated = true;
			console.log(
				`[Git Hook] Removed package from manifest: "${pkgName}"`
			);
		}
		continue;
	}

	// exists but not registered
	if (!packagesFile.packages[pkgName]) {
		console.error(
			`\n[Git Hook Error]: The package "${pkgName}" is staged but does not exist in ${PACKAGES_JSON}.\n` +
				`   Please register "${pkgName}" in packages.json before committing.`
		);
		process.exit(1);
	}

	packagesFile.packages[pkgName].published = Date.now();
	updated = true;
	console.log(`[Git Hook] Updated timestamp for package: "${pkgName}"`);
}

// save and stage
if (updated) {
	fs.writeFileSync(PACKAGES_JSON, JSON.stringify(packagesFile, null, 4));

	execSync(`npx prettier --write ${PACKAGES_JSON}`);

	execSync(`git add ${PACKAGES_JSON}`);
}
