use app_domains_core::DomainResult;
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct CommsToolExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

pub trait CommsToolPort {
    fn execute_comms_tool(&self, args: &Value) -> DomainResult<CommsToolExecutionOutput>;
}

pub trait CommsToolStore {
    fn get_account(&self, account_id: &str) -> DomainResult<Option<Value>>;
    fn list_accounts(&self, operator_id: Option<&str>, channel: Option<&str>) -> DomainResult<Vec<Value>>;
    fn list_operator_directory(
        &self,
        channel: Option<&str>,
        query: Option<&str>,
        name: Option<&str>,
        title: Option<&str>,
        limit: i64,
    ) -> DomainResult<Vec<Value>>;
    fn get_thread(&self, thread_id: &str) -> DomainResult<Option<Value>>;
    fn list_threads(
        &self,
        channel: Option<&str>,
        account_id: Option<&str>,
        folder: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<Value>>;
    fn list_messages(&self, thread_id: &str, limit: i64, offset: i64) -> DomainResult<Vec<Value>>;
    fn get_message(&self, thread_id: &str, message_id: &str) -> DomainResult<Option<Value>>;
    fn upsert_account(
        &self,
        account_id: &str,
        operator_id: &str,
        channel: &str,
        address: &str,
        display_name: &str,
        status: Option<&str>,
    ) -> DomainResult<Value>;
    fn create_thread(
        &self,
        channel: &str,
        account_id: &str,
        title: Option<&str>,
        subject: Option<&str>,
        participants: Option<&Value>,
        folder: Option<&str>,
    ) -> DomainResult<Value>;
    fn append_message(
        &self,
        thread_id: &str,
        direction: &str,
        from_account_ref: &str,
        to_participants: Option<&Value>,
        cc_participants: Option<&Value>,
        bcc_participants: Option<&Value>,
        subject: Option<&str>,
        body_text: &str,
        reply_to_message_id: Option<&str>,
    ) -> DomainResult<Value>;
    fn send_outbound_message(
        &self,
        channel: &str,
        thread_id: Option<&str>,
        from_account_ref: &str,
        to_participants: Option<&Value>,
        cc_participants: Option<&Value>,
        bcc_participants: Option<&Value>,
        subject: Option<&str>,
        body_text: &str,
        reply_to_message_id: Option<&str>,
    ) -> DomainResult<Value>;
    fn update_thread(
        &self,
        thread_id: &str,
        title: Option<&str>,
        subject: Option<&str>,
        status: Option<&str>,
        folder: Option<&str>,
    ) -> DomainResult<Option<Value>>;
    fn delete_thread(&self, thread_id: &str) -> DomainResult<()>;
}
