pub mod comms_domain_adapter;
pub mod comms_delivery;
pub mod domain_ports;
pub mod error;
pub mod health;
pub mod org_domain_adapter;
pub mod sqlite;
pub mod state;
pub mod workspace;

pub use error::PersistenceError;
pub use health::{PersistenceHealthReport, PersistenceHealthState};
pub use comms_domain_adapter::CommsManageExecutionOutput;
pub use domain_ports::{PersistenceCommsToolPort, PersistenceOrgToolPort};
pub use app_domain_comms::delivery_policy::{SendChatInput, SendEmailInput, SendSmsInput};
pub use comms_delivery::CommsDeliveryService;
pub use org_domain_adapter::OrgManageExecutionOutput;
pub use sqlite::{bootstrap_workspace, BootstrapResult, DatabaseKind};
pub use state::{
    CommsAccountRecord, CommsMessageRecord, CommsThreadRecord, OrgChartStateRecord,
    PersistenceStateStore, ThreadMessageRecord, ThreadRecord, WorkUnitRecord,
};
pub use workspace::{WorkspaceMetadata, WorkspacePaths};

pub fn persistence_ready() -> bool {
    true
}
