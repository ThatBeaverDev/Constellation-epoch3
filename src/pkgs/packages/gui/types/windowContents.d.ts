import { ArrayLog } from "../../../../util/types/worker";

export interface WindowBaseItem {
	x: number;
	y: number;
}

export interface WindowText extends WindowBaseItem {
	type: "text";
	text: string | ArrayLog;

	font?: string;
	fontSize?: number;
}

export interface WindowImage extends WindowBaseItem {
	type: "image";
	sourceType: "url" | "file";

	source: string;

	width: number;
	height: number;
}

export interface WindowButton extends WindowBaseItem {
	type: "button";
	text: string;

	font?: string;
	fontSize?: number;

	identifier: string;
}

export interface WindowTextBox extends WindowBaseItem {
	type: "textBox";
	message: string;
	backText?: string;

	font?: string;
	fontSize?: number;

	complete?: boolean;
	identifier: string;
}

export interface WindowBox extends WindowBaseItem {
	type: "box";
	width: number;
	height: number;

	fill?: string;
	stroke?: string;
}

export type WindowContentItem =
	WindowText | WindowImage | WindowButton | WindowTextBox | WindowBox;
