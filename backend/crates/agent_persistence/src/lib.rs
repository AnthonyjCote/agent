pub mod comms_tool;
pub mod comms_delivery;
pub mod error;
pub mod health;
pub mod org_tool;
pub mod sqlite;
pub mod state;
pub mod workspace;

pub use error::PersistenceError;
pub use health::{PersistenceHealthReport, PersistenceHealthState};
pub use comms_tool::CommsManageExecutionOutput;
pub use comms_delivery::{CommsDeliveryService, SendChatInput, SendEmailInput, SendSmsInput};
pub use org_tool::OrgManageExecutionOutput;
pub use sqlite::{bootstrap_workspace, BootstrapResult, DatabaseKind};
pub use state::{
    CommsAccountRecord, CommsMessageRecord, CommsThreadRecord, OrgChartStateRecord,
    PersistenceStateStore, ThreadMessageRecord, ThreadRecord, WorkUnitRecord,
};
pub use workspace::{WorkspaceMetadata, WorkspacePaths};

pub fn persistence_ready() -> bool {
    true
}
