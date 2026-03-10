use std::collections::HashSet;

#[derive(Debug, Default)]
pub struct ThreadRunLock {
    active_threads: HashSet<String>,
}

impl ThreadRunLock {
    pub fn acquire(&mut self, thread_id: &str) -> bool {
        self.active_threads.insert(thread_id.to_string())
    }

    pub fn release(&mut self, thread_id: &str) {
        self.active_threads.remove(thread_id);
    }

    pub fn is_locked(&self, thread_id: &str) -> bool {
        self.active_threads.contains(thread_id)
    }
}
