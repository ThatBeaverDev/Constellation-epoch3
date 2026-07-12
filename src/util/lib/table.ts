export function formatTable(
	rows: string[][],
	padding: number = 1,
	verticalGap: string = ""
): string {
	if (rows.length === 0) return "";

	const columnCount = Math.max(...rows.map((row) => row.length));

	// Compute max width for each column
	const colWidths: number[] = Array(columnCount).fill(0);

	for (const row of rows) {
		for (let i = 0; i < columnCount; i++) {
			const cell = row[i] ?? "";
			colWidths[i] = Math.max(colWidths[i], cell.length);
		}
	}

	const pad = " ".repeat(padding);

	const lines = rows.map((row) => {
		let line = "";

		for (let i = 0; i < columnCount; i++) {
			const content = row[i] ?? "";
			const width = colWidths[i];

			// pad cell to column width
			line += content + " ".repeat(width - content.length);

			// add spacing / separator between columns
			if (i < columnCount - 1) {
				line += pad;
				if (verticalGap) line += verticalGap;
				line += pad;
			}
		}

		return line.trimEnd();
	});

	return lines.join("\n");
}
