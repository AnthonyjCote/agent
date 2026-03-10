use crate::{models::run::RunEvent, ports::trace_store::TraceStorePort};

use crate::runtime::tracing::memory_trace_store::MemoryTraceStore;

pub(crate) fn append_event(
    trace_store: &MemoryTraceStore,
    on_event: &mut dyn FnMut(RunEvent),
    event: RunEvent,
) {
    on_event(event.clone());
    trace_store.append(event);
}
