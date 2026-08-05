export enum WorkerMessageIntent {
	log = 0,
	warn = 1,
	error = 2,

	execute_program = 3,

	get_all_processes = 4,
	get_self_process = 5,
	get_parent_process = 6,

	env_network_get = 7,

	get_input = 8,
	set_logs = 9,
	terminal_dimensions = 10,

	kernel_uptime = 11,
	kernel_version = 12,

	play_sound = 14,
	pause_sound = 15,
	resume_sound = 16,
	remove_sound = 17,

	get_live_canvas = 18,
	remove_live_canvas = 19,

	socket_connect = 20,
	socket_disconnect = 21,
	send_socket_packet_to_server = 22,

	create_socket = 23,
	end_socket = 24,
	send_socket_packet_to_client = 25,

	trigger_proxy_event = 26,

	exit = 27,

	fs_readFile = 28,
	fs_writeFile = 29,
	fs_unlink = 30,
	fs_get_metadata_entry = 31,
	fs_set_metadata_entry = 32,
	fs_list_metadata_entries = 33,
	fs_mkdir = 34,
	fs_createAlias = 35,
	fs_readdir = 36,
	fs_rmdir = 37,
	fs_rm = 38,
	fs_isdir = 39,
	fs_exists = 40,
	fs_stats = 41,

	// sync fs
	fs_read_sync = 13,
	fs_readdir_sync = 44,
	fs_stat_sync = 45,

	// fs sizes
	fs_used_size = 46,
	fs_max_size = 47,

	change_password = 42,
	validate_password = 43
}
