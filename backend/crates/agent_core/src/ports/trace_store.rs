use crate::models::run::RunEvent;

pub trait TraceStorePort {
    fn append(&self, event: RunEvent);
}
