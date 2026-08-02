import { NetworkDataResponse } from "@/types/worker";
import { WorkerMessageIntent } from "../../../worker/types/intents";
import { mainThreadMessageHandler } from "./handler";
import Epoch3Kernel from "../../kernel";
import { encodeBase64 } from "@/lib/base64";
import { IS_NODE } from "../../constants";
import { blobToDataURL } from "@/lib/uri";
import { WorkerEnv_Network_Get } from "../../../worker/types/messages";

export default function handleNetwork(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	netMap?: Epoch3Kernel["netMap"]
) {
	function handleWithNetmap(
		url: string,
		format: WorkerEnv_Network_Get["format"]
	): NetworkDataResponse {
		const path = url[0] == "/" ? url.substring(1) : url;

		if (netMap?.[path]) {
			const data = netMap[path];
			let response;
			switch (format) {
				case "text":
					response = data;
					break;

				case "json":
					response = JSON.parse(data);
					break;

				case "datauri":
					response = `data:text/javascript;base64,${encodeBase64(data)}`;
					break;

				case "blob":
					response = new Blob([data], {
						type: "text/javascript"
					});
					break;
			}

			return {
				isOk: true,
				statusCode: 200,
				statusText: "Success",
				response: response
			};
		} else {
			return {
				isOk: false,
				statusCode: 400,
				statusText: "Not found"
			};
		}
	}

	async function handleWithNodeReadfile(
		url: string,
		format: WorkerEnv_Network_Get["format"]
	): Promise<NetworkDataResponse> {
		// this is to a local position, we should read from the program store (if node)
		// @ts-expect-error
		const fs = await import("node:fs/promises");
		// @ts-expect-error
		const path = await import("node:path");

		const constellationRoot: string = path.resolve(
			// @ts-expect-error
			import.meta.dirname,
			".."
		);

		const targetPath: string = path.resolve(constellationRoot, "." + url);

		if (!targetPath.startsWith(constellationRoot)) {
			throw new Error("Attempt to read above project root denied.");
		}

		const contents = await fs.readFile(targetPath, "utf8");

		let result;
		switch (format) {
			case "text":
				result = contents;
				break;
			case "json":
				result = JSON.parse(contents);
				break;
			case "datauri":
				result = await blobToDataURL(new Blob([contents]));
				break;
			case "blob":
				result = new Blob([contents]);

			default:
				throw new Error(`Unkown request format: '${format}'`);
		}

		return {
			response: result,
			isOk: true,
			statusCode: 200,
			statusText: ""
		};
	}

	handle(
		WorkerMessageIntent.env_network_get,
		async ({ type, url, format, body, headers, options }) => {
			const processedType = `${type}`.toLowerCase();
			let method = "GET";

			switch (processedType) {
				case "get":
					method = "GET";
					break;
				case "post":
					method = "POST";
					break;
				default:
					throw new Error(
						`Unknown request type: '` +
							processedType +
							`' (given '${type}')`
					);
			}

			const bodyString =
				method == "GET"
					? undefined
					: typeof body == "object"
						? JSON.stringify(body)
						: String(body);

			const isLocal = !url.includes("://");

			if (netMap && isLocal) return handleWithNetmap(url, format);

			if (isLocal && IS_NODE) {
				return handleWithNodeReadfile(url, format);
			} else {
				const request = await fetch(url, {
					method,
					body: bodyString,
					headers: headers,
					cache: (options.cache ?? true) ? "no-store" : "default"
				});

				let result;
				switch (format) {
					case "text":
						result = await request.text();
						break;
					case "json":
						result = await request.json();
						break;

					case "datauri":
						const blob = await request.blob();

						result = await blobToDataURL(blob);
						break;

					case "blob":
						result = await request.blob();
						break;

					default:
						throw new Error(`Unkown request format: '${format}'`);
				}

				return {
					response: request.ok ? result : undefined,
					errorResponse: request.ok ? undefined : result,

					isOk: request.ok,
					statusCode: request.status,
					statusText: request.statusText
				};
			}
		}
	);
}
