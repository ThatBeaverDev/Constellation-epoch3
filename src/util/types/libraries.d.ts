import GuiWindow from "../../pkgs/packages/lib-gui/lib-gui";
import RoturLibrary, {
	RoturLibraryConstructor
} from "../../pkgs/packages/lib-rotur/lib-rotur";
import { type getRoturToken } from "../../pkgs/packages/lib-rotur/lib-rotur";

export interface LibraryExports {
	"lib-gui": { default: typeof GuiWindow };
	"lib-rotur": {
		default: RoturLibraryConstructor;
		getRoturToken: getRoturToken;
	};
}
