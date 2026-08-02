import { FilesystemInterface } from "../fs/fs";
import Constellation from "../kernel";
import NodeUI from "../ui/node";

export default function ConstellationNode(
	onInstallReady: (fs: FilesystemInterface) => Promise<void> | void
) {
	return new Constellation(onInstallReady, NodeUI);
}
