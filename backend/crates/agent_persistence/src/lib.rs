pub mod error;
pub mod health;
pub mod sqlite;
pub mod state;
pub mod workspace;

pub use error::PersistenceError;
pub use health::{PersistenceHealthReport, PersistenceHealthState};
pub use sqlite::{bootstrap_workspace, BootstrapResult, DatabaseKind};
pub use state::{OrgChartStateRecord, PersistenceStateStore, ThreadMessageRecord, ThreadRecord};
pub use workspace::{WorkspaceMetadata, WorkspacePaths};

pub fn persistence_ready() -> bool {
    true
}
