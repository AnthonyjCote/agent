#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use adapter::{desktop_capabilities, list_seed_agents, AgentSummary, RuntimeCapabilities};

#[tauri::command]
fn get_capabilities() -> RuntimeCapabilities {
    desktop_capabilities()
}

#[tauri::command]
fn list_agents() -> Vec<AgentSummary> {
    list_seed_agents()
}

fn main() {
    let _ = agent_desktop::desktop_ready();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_capabilities, list_agents])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
