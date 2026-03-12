use std::{
    collections::HashMap,
    process::Command,
    sync::{Mutex, OnceLock},
};

#[derive(Debug, Clone)]
struct RunProcessState {
    pid: u32,
    cancel_requested: bool,
}

fn registry() -> &'static Mutex<HashMap<String, RunProcessState>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, RunProcessState>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register_run_process(run_id: &str, pid: u32) {
    if let Ok(mut guard) = registry().lock() {
        guard.insert(
            run_id.to_string(),
            RunProcessState {
                pid,
                cancel_requested: false,
            },
        );
    }
}

pub fn clear_run_process(run_id: &str) {
    if let Ok(mut guard) = registry().lock() {
        guard.remove(run_id);
    }
}

pub fn was_cancel_requested(run_id: &str) -> bool {
    registry()
        .lock()
        .ok()
        .and_then(|guard| guard.get(run_id).map(|state| state.cancel_requested))
        .unwrap_or(false)
}

pub fn cancel_run_process(run_id: &str) -> bool {
    let pid = {
        let Ok(mut guard) = registry().lock() else {
            return false;
        };
        let Some(state) = guard.get_mut(run_id) else {
            return false;
        };
        state.cancel_requested = true;
        state.pid
    };

    kill_pid(pid)
}

fn kill_pid(pid: u32) -> bool {
    #[cfg(unix)]
    {
        Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}
