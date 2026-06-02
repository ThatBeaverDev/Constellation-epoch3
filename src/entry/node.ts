import Constellation from "..";
import { FilesystemInterface } from "../lib/fs";
import NodeUI from "../ui/node";

export default function ConstellationNode(
	onInstallReady: (fs: FilesystemInterface) => Promise<void> | void
) {
	return new Constellation(onInstallReady, NodeUI);
}
