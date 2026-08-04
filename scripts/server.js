import * as httpServer from "http-server";

const server = httpServer.createServer({
	root: ".",
	cache: -1, // no cache

	headers: {
		"Cross-Origin-Opener-Policy": "same-origin",
		"Cross-Origin-Embedder-Policy": "require-corp"
	}
});

const portno = Number(process.argv[2]);
const PORT = isNaN(portno) ? 8080 : portno;

server.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
