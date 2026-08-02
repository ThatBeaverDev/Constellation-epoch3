import { FilesystemInterface } from "../fs/fs";
import Constellation from "../kernel";
import BrowserUI from "../ui/dom";

export default function ConstellationWeb(
	onInstallReady: (fs: FilesystemInterface) => Promise<void> | void,
	netmap?: Record<string, string>
) {
	return new Constellation(onInstallReady, BrowserUI, netmap);
}
