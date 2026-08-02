export interface Service {
	running: boolean;
	restartPolicy: "always" | "once" | "never";

	failed: false | Error;

	directory: string;
	fallback?: string;
	args: string[];
	display: boolean;
	askForUser: boolean;
}

export interface ServiceJSON {
	/**
	 * Path to the file to execute.
	 */
	directory: string;

	/**
	 * Always will always try to restart if it exits. Once onle starts it on boot. Both give up if an error is thrown.
	 */
	restart: "always" | "once";

	/**
	 * String arguments to pass to the program
	 */
	args?: string[];

	/**
	 * Whether to pass display control
	 */
	display?: boolean;

	/**
	 * Whether `init` should request username and password from the user.
	 */
	askForUser?: boolean;
	/*
	 * Path to the file to execute in the case of a failure
	 */
	fallback?: string;
}
