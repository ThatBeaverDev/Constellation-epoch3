export interface WindowText {
	type: "text";
	text: string;

	font?: string;
	fontSize?: number;

	x: number;
	y: number;
}

export interface WindowImage {
	type: "image";
	sourceType: "url" | "file";

	source: string;

	x: number;
	y: number;

	width: number;
	height: number;
}

export interface WindowButton {
	type: "button";
	text: string;

	font?: string;
	fontSize?: string;

	identifier: string;
}

export type WindowContentItem = WindowText | WindowImage | WindowButton;
