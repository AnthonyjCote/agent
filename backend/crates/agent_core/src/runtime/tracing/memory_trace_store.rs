use std::sync::{Arc, Mutex};

use crate::{models::run::RunEvent, ports::trace_store::TraceStorePort};

#[derive(Debug, Default)]
pub struct MemoryTraceStore {
    events: Arc<Mutex<Vec<RunEvent>>>,
}

impl MemoryTraceStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn snapshot(&self) -> Vec<RunEvent> {
        self.events.lock().map(|g| g.clone()).unwrap_or_default()
    }
}

impl TraceStorePort for MemoryTraceStore {
    fn append(&self, event: RunEvent) {
        if let Ok(mut guard) = self.events.lock() {
            guard.push(event);
        }
    }
}
