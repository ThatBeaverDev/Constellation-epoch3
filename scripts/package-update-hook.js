import fs from "fs";
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
	console.debug(file);

	if (cleanPath.startsWith(PACKAGES_DIRECTORY)) {
		// Extract top-level folder name inside src/pkgs/packages/
		const relativePath = cleanPath.slice(PACKAGES_DIRECTORY.length);
		const pkgName = relativePath.split("/")[0];
		console.debug(pkgName);

		if (pkgName) {
			modifiedPackages.add(pkgName);
		}
	}
}

// update package published times, throw if new package present
for (const pkgName of modifiedPackages) {
	const pkgPath = `${PACKAGES_DIRECTORY}${pkgName}`;
	const existsOnDisk = fs.existsSync(pkgPath);

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
				`   Please register "${pkgName}" in packages.json before committing.\n`
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
