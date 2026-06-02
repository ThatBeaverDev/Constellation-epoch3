import Constellation from "..";
import { FilesystemInterface } from "../lib/fs";
import BrowserUI from "../ui/dom";

export default function ConstellationWeb(
	onInstallReady: (fs: FilesystemInterface) => Promise<void> | void
) {
	return new Constellation(onInstallReady, BrowserUI);
}
