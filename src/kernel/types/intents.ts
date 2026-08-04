export enum RuntimeMessageIntent {
	begin_execution = 0,
	dispatch_frame = 1,
	program_exit_inform = 2,

	socket_client_connected = 3,
	socket_client_disconnected = 4,
	socket_client_sent_packet = 5,
	socket_server_ended = 6,
	socket_server_sent_packet = 7,

	trigger_event = 8,

	// output proxies
	proxy_log = 9,
	proxy_input = 10,
	proxy_set_logs = 11,
	proxy_get_dimensions = 12,

	send_atomics_channel = 13
}
