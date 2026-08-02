import { WorkerMessageIntent } from "../../../worker/types/intents";
import Epoch3Kernel from "../../kernel";
import { mainThreadMessageHandler } from "./handler";

export default function handleKernelInfo(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	kernel: Epoch3Kernel
) {
	handle(WorkerMessageIntent.kernel_uptime, () => Date.now() - kernel.start);
	handle(WorkerMessageIntent.kernel_version, () => kernel.version);
}
