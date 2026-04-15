import { Environment } from "../types/worker";
import { ArrayLog } from "../ui/ui";
import { decodeBase64, encodeBase64 } from "../usrlib/base64";
import { unimportantColour } from "../usrlib/colours";

export default async function* base64Util(
	env: Environment,
	[action, arg1, arg2]: [
		string | undefined,
		string | undefined,
		string | undefined
	]
) {
	function hint(): ArrayLog {
		return [
			{
				text: `Usage:\n`
			},
			{ text: ` b64 `, colour: unimportantColour },
			{ text: `encode [text]\n` },

			{ text: ` b64 `, colour: unimportantColour },
			{ text: `encodeFile [input file]\n` },

			{
				text: ` b64 `,
				colour: unimportantColour
			},
			{ text: `encodeToFile [output file] [text]` },

			{ text: "\n\n" },

			{ text: ` b64 `, colour: unimportantColour },
			{ text: `decode [text]\n` },

			{ text: ` b64 `, colour: unimportantColour },
			{ text: `decodeFile [input file]\n` },

			{ text: ` b64 `, colour: unimportantColour },
			{ text: `decodeToFile [output file] [text]` }
		];
	}

	if (!arg1) return hint();
	const filePath = env.path.resolve(env.workingDirectory, arg1);

	switch (action) {
		case "encode":
			// encode and return
			return encodeBase64(arg1);

		case "encodeFile":
			// encode file and return
			const fileContents = await env.fs.readFile(filePath);

			return encodeBase64(fileContents ?? "");

		case "encodeToFile": {
			// encode and write to file
			if (!arg2) return hint();

			const encodedText = encodeBase64(arg2);

			await env.fs.writeFile(filePath, encodedText);

			return;
		}

		case "decode":
			// decode and return
			return decodeBase64(arg1);

		case "decodeFile": {
			// decode fle and return
			const fileContents = await env.fs.readFile(filePath);

			return decodeBase64(fileContents ?? "");
		}

		case "decodeToFile": {
			// decode and write to file
			if (!arg2) return hint();

			const decodedText = decodeBase64(arg2);

			await env.fs.writeFile(filePath, decodedText);

			return;
		}

		default:
			return hint();
	}
}
