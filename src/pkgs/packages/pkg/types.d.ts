// remote

export interface RemotePackagesJson {
	packages: Partial<Record<string, RemotePackage>>;
}

export interface RemotePackage {
	author?: string;
	dependencies?: string[];
	published?: number;

	directories?: string[];
	main?: boolean;
}

// local

export interface Repository {
	url: string;
	packages: Partial<Record<string, Package>>;
}

export interface PackagesJson extends RemotePackagesJson {
	packages: Partial<Record<string, Package>>;
	repositories: Repository[];
}

export interface Package extends RemotePackage {
	files: string[];
}
