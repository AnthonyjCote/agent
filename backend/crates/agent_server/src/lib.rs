pub mod runtime_service;

pub fn server_ready() -> bool {
    adapter::adapter_ready() && agent_core::core_ready()
}
