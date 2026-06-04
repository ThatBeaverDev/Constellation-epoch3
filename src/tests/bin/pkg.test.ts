import { describe, it, expect, type Mock } from "vitest";
import pkg from "../../pkgs/packages/pkg/pkg";
import { basicNetworkGetSuccess, createMockEnv } from "./mock";

describe("Package manager, `pkg`", () => {
	it("Help printed without command", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue(undefined);

		await Array.fromAsync(pkg(env, []));

		expect(env.print).toHaveBeenCalled();

		expect(env.print).toHaveBeenCalledWith([
			expect.objectContaining({
				text: expect.stringContaining("Commands:")
			})
		]);
	});

	it("Package name required to install", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		await Array.fromAsync(pkg(env, ["install"]));

		expect(env.print).toHaveBeenCalledWith([
			{
				text: "You must specify a package name to install.",
				colour: "#ff0000"
			}
		]);
	});

	it("Package installation", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockImplementation(
			async (_method, url) => {
				if (url.includes("packages.json")) {
					return {
						...basicNetworkGetSuccess,

						response: {
							packages: {
								testpkg: {
									author: "ThatBeaverDev"
								}
							}
						}
					};
				}

				if (url.includes("testpkg/testpkg.js")) {
					return {
						...basicNetworkGetSuccess,
						response: "console.log('hello')"
					};
				}

				return null;
			}
		);

		await Array.fromAsync(pkg(env, ["install", "testpkg"]));

		expect(env.fs.writeFile).toHaveBeenCalledWith(
			"/bin/testpkg.js",
			"console.log('hello')"
		);

		expect(env.print).toHaveBeenCalledWith(
			"Match for testpkg found in repository https://repo.test"
		);

		expect(env.print).toHaveBeenCalledWith("Match has source, installing");

		expect(env.print).toHaveBeenCalledWith([
			{
				text: "Package testpkg successfully installed.",
				colour: "#00ff00"
			}
		]);
	});

	it("Package cannot be installed twice", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {
				testpkg: {
					author: "ThatBeaverDev",
					files: ["/bin/testpkg.js"]
				}
			},
			repositories: []
		});

		await Array.fromAsync(pkg(env, ["install", "testpkg"]));

		expect(env.print).toHaveBeenCalledWith([
			{
				text: "Package testpkg is already installed.",
				colour: "#00ff00"
			}
		]);
	});

	it("Package uninstallation", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {
				testpkg: {
					author: "ThatBeaverDev",
					files: ["/bin/testpkg.js"]
				}
			},
			repositories: []
		});

		await Array.fromAsync(pkg(env, ["remove", "testpkg"]));

		expect(env.fs.rm).toHaveBeenCalledWith("/bin/testpkg.js");
	});

	it("Remote package listing", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockResolvedValue({
			...basicNetworkGetSuccess,
			response: {
				packages: {
					alpha: {},
					beta: {}
				}
			}
		});

		await Array.fromAsync(pkg(env, ["list", "remote"]));

		expect(env.print).toHaveBeenCalledWith([
			expect.objectContaining({
				text: expect.stringContaining("2 package(s)")
			}),
			expect.objectContaining({
				text: expect.stringContaining("alpha")
			}),
			expect.objectContaining({
				text: expect.stringContaining("beta")
			})
		]);
	});

	it("Reports orphaned packages when removing repositories", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {
						testpkg: {
							author: "ThatBeaverDev",
							files: []
						}
					}
				}
			]
		});

		await Array.fromAsync(
			pkg(env, ["repo", "remove", "https://repo.test"])
		);

		expect(env.print).toHaveBeenCalledWith([
			expect.objectContaining({
				text: expect.stringContaining("1 packages are now orphaned")
			})
		]);
	});

	it("Continues installing after encountering installed package", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {
				already: {
					author: "ThatBeaverDev",
					files: ["/bin/already.js"]
				}
			},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockImplementation(
			async (_method, url) => {
				if (url.includes("packages.json")) {
					return {
						...basicNetworkGetSuccess,

						response: {
							packages: {
								newpkg: {
									author: "ThatBeaverDev"
								}
							}
						}
					};
				}

				if (url.includes("newpkg/newpkg.js")) {
					return {
						...basicNetworkGetSuccess,
						response: "export default true"
					};
				}
			}
		);

		await Array.fromAsync(pkg(env, ["install", "already", "newpkg"]));

		expect(env.print).toHaveBeenCalledWith([
			{
				text: "Package already is already installed.",
				colour: "#00ff00"
			}
		]);

		expect(env.fs.writeFile).toHaveBeenCalledWith(
			"/bin/newpkg.js",
			"export default true"
		);
	});

	it("Caches repository package.json requests", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockImplementation(
			async (_method, url) => {
				if (url.includes("packages.json")) {
					return {
						...basicNetworkGetSuccess,

						response: {
							packages: {
								alpha: {
									author: "ThatBeaverDev"
								},
								beta: {
									author: "ThatBeaverDev"
								}
							}
						}
					};
				}

				return { ...basicNetworkGetSuccess, response: "source" };
			}
		);

		await Array.fromAsync(pkg(env, ["install", "alpha", "beta"]));

		const packageJsonCalls = (
			env.network.request as Mock
		).mock.calls.filter((call) => call[1].includes("packages.json"));

		expect(packageJsonCalls).toHaveLength(1);
	});

	it("Installs dependencies recursively", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockImplementation(
			async (_method, url) => {
				if (url.includes("packages.json")) {
					return {
						...basicNetworkGetSuccess,

						response: {
							packages: {
								mainpkg: {
									author: "ThatBeaverDev",
									dependencies: ["dep"]
								},
								dep: {
									author: "ThatBeaverDev"
								}
							}
						}
					};
				}

				if (url.includes("mainpkg/mainpkg.js")) {
					return { ...basicNetworkGetSuccess, response: "main" };
				}

				if (url.includes("dep/dep.js")) {
					return { ...basicNetworkGetSuccess, response: "dep" };
				}
			}
		);

		await Array.fromAsync(pkg(env, ["install", "mainpkg"]));

		expect(env.fs.writeFile).toHaveBeenCalledWith(
			"/bin/mainpkg.js",
			"main"
		);

		expect(env.fs.writeFile).toHaveBeenCalledWith("/bin/dep.js", "dep");
	});

	it("Does not install package when source is missing", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockImplementation(
			async (_method, url) => {
				if (url.includes("packages.json")) {
					return {
						packages: {
							brokenpkg: {
								author: "ThatBeaverDev"
							}
						}
					};
				}

				return null;
			}
		);

		await Array.fromAsync(pkg(env, ["install", "brokenpkg"]));

		expect(env.fs.writeFile).not.toHaveBeenCalledWith(
			"/bin/brokenpkg.js",
			expect.anything()
		);
	});

	it("Continues uninstalling remaining packages after missing package", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {
				realpkg: {
					author: "ThatBeaverDev",
					files: ["/bin/realpkg.js"]
				}
			},
			repositories: []
		});

		await Array.fromAsync(pkg(env, ["remove", "missing", "realpkg"]));

		expect(env.fs.rm).toHaveBeenCalledWith("/bin/realpkg.js");
	});

	it("Only removes the targeted repository", async () => {
		const env = createMockEnv();

		const data = {
			packages: {},
			repositories: [
				{
					url: "https://keep.test",
					packages: {}
				},
				{
					url: "https://remove.test",
					packages: {}
				}
			]
		};

		(env.fs.readFile as Mock).mockResolvedValue(data);

		await Array.fromAsync(
			pkg(env, ["repo", "remove", "https://remove.test"])
		);

		const finalWrite = (env.fs.writeFile as Mock).mock.calls.at(-1) ?? [];

		const writtenData = JSON.parse(finalWrite[1]);

		expect(writtenData.repositories).toHaveLength(1);

		expect(writtenData.repositories[0].url).toBe("https://keep.test");
	});

	it("Reports correct missing package name", async () => {
		const env = createMockEnv();

		(env.fs.readFile as Mock).mockResolvedValue({
			packages: {},
			repositories: [
				{
					url: "https://repo.test",
					packages: {}
				}
			]
		});

		(env.network.request as Mock).mockResolvedValue({
			packages: {}
		});

		await Array.fromAsync(pkg(env, ["install", "missing1", "missing2"]));

		expect(env.print).toHaveBeenCalledWith([
			{
				text: "Package missing2 was not found in any repositories.",
				colour: "#ff0000"
			}
		]);
	});
});
