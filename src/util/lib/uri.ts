// Source - https://stackoverflow.com/a/12300351
// Posted by devnull69, modified by community. See post 'Timeline' for change history
// Retrieved 2026-04-11, License - CC BY-SA 3.0

export function dataURItoBlob(dataURI: string) {
	// convert base64 to raw binary data held in a string
	// doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
	const byteString = atob(dataURI.split(",")[1]);

	// separate out the mime component
	const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

	// write the bytes of the string to an ArrayBuffer
	const ab = new ArrayBuffer(byteString.length);

	// create a view into the buffer
	const ia = new Uint8Array(ab);

	// set the bytes of the buffer to the correct values
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}

	// write the ArrayBuffer to a blob, and you're done
	const blob = new Blob([ab], { type: mimeString });
	return blob;
}

export async function blobToDataURL(blob: Blob) {
	const buffer = await blob.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	const chunkSize = 0x8000;
	let binary = "";

	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		// @ts-expect-error
		binary += String.fromCharCode.apply(null, chunk);
	}

	return `data:${blob.type};base64,${btoa(binary)}`;
}

export function blobToUrl(blob: Blob) {
	const url = URL.createObjectURL(blob);

	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 5000);

	return url;
}
