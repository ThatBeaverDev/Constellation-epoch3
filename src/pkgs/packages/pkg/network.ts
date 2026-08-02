import { Environment, NetworkDataResponse } from "@/types/worker";
import { PackagesJson, RemotePackagesJson } from "./types";

export default function getNetworking(
	env: Environment,
	packages: PackagesJson
) {
	async function fetch(
		url: string | string[],
		json?: false
	): Promise<NetworkDataResponse<string>>;
	async function fetch<T extends Object = Object>(
		url: string | string[],
		json: true
	): Promise<NetworkDataResponse<T>>;
	async function fetch<T extends Object = Object>(
		url: string | string[],
		json: boolean = false
	) {
		const urls =
			typeof url == "string"
				? // URL and proxy url
					[
						url,
						`https://proxy.mistium.com/?url=${encodeURIComponent(url)}`
					]
				: [
						// all URLs then proxied versions
						...url,
						...url.map(
							(item) =>
								`https://proxy.mistium.com/?url=${encodeURIComponent(item)}`
						)
					];

		const requests: NetworkDataResponse[] = [];

		for (const url of urls) {
			try {
				const request = await env.network.request<T>(
					"get",
					url,
					json ? "json" : "text",
					undefined,
					undefined,
					{ cache: false }
				);

				requests.push(request);

				if (request.isOk) return request;
			} catch {}
		}

		const last = requests.at(-1);

		if (last) return last;

		return {
			isOk: false,
			statusCode: 404,
			statusText: "Not found."
		} as NetworkDataResponse;
	}

	async function resolvePackageFromRepos(packageName: string) {
		for (const repo of packages.repositories) {
			const jsonRequest = await fetch<RemotePackagesJson>(
				repo.url + "/packages.json",
				true
			);

			if (!jsonRequest.isOk) {
				env.warn(
					`Repository at ${repo.url} did not respond with a package.json.`
				);
				continue;
			}

			const repoJson = jsonRequest.response;

			const pkg = repoJson?.packages?.[packageName];
			if (!pkg) continue;

			return {
				repo,
				meta: pkg
			};
		}
		return null;
	}

	return { fetch, resolvePackageFromRepos };
}
